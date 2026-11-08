// Local end-to-end tests for the two Edge Functions. Run: npm run test:functions (needs `npm install` once for typescript).
// Supabase and Brevo are faked in memory; nothing leaves this machine.
import { makeDb } from './fakedb.mjs';
const db = makeDb();
globalThis.__createClient = () => db.client;
const env = { SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'service-key', BREVO_API_KEY: process.env.NO_BREVO ? undefined : 'test-key', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' };
// Gmail SMTP stub (denomailer): records sends; set gmail.fail = true to simulate an outage.
const gmail = { sent: [], fail: false };
globalThis.__SMTPClient = class { constructor(cfg) { this.cfg = cfg; } async send(m) { if (gmail.fail) throw new Error('535 auth failed'); gmail.sent.push({ ...m, cfg: this.cfg }); } async close() {} };
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { globalThis.__handlers.push(h); }, resolveDns: async () => { throw Object.assign(new Error('x'), { name: 'NotFound' }); } };
globalThis.__handlers = [];
const sent = [];
const dns = { 'gmail.com': { Status: 0, Answer: [{ type: 15, data: 'mx' }] }, 'videotron.ca': { Status: 0, Answer: [{ type: 15, data: 'mx' }] }, 'nxdomain-zzz.com': { Status: 3 }, 'nomx.org': { Status: 0 } };
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://dns.google/resolve')) {
    const q = new URL(u); const name = q.searchParams.get('name'); const type = q.searchParams.get('type');
    const rec = dns[name]; if (!rec) return new Response('', { status: 500 });
    if (type !== 'MX' && rec.Status === 0 && !rec.Answer) return new Response(JSON.stringify({ Status: 0 }), { status: 200 });
    return new Response(JSON.stringify(rec), { status: 200 });
  }
  if (u === 'https://api.brevo.com/v3/smtp/email') { const p = JSON.parse(init.body); sent.push(p); if (p.to[0].email === 'bounce@gmail.com') return new Response('{"code":"invalid"}', { status: 400 }); return new Response(JSON.stringify({ messageId: 'msg-' + sent.length }), { status: 201 }); }
  if (u === 'https://api.brevo.com/v3/contacts') { sent.push({ contact: JSON.parse(init.body) }); return new Response('{"id":1}', { status: 201 }); }
  throw new Error('unexpected fetch ' + u);
};
await import('./.build/request-code/index.mjs');
await import('./.build/verify-code/index.mjs');
const [requestCode, verifyCode] = globalThis.__handlers;
const call = async (h, body, headers = {}) => { const r = await h(new Request('https://x/f', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://aimsummer.com', 'x-forwarded-for': '1.2.3.4', ...headers }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json(), cors: r.headers.get('access-control-allow-origin') }; };
let pass = 0, fail = 0;
const expect = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('FAIL', name, JSON.stringify(extra)); } };
let r;
r = await call(requestCode, { email: 'sophie@gmail.com' }); expect('consent required', r.status === 400 && r.body.error === 'consent_required', r);
r = await call(requestCode, { email: 'not-an-email', consent_info: true }); expect('invalid email', r.body.error === 'invalid_email', r);
r = await call(requestCode, { email: 'x@mailinator.com', consent_info: true }); expect('disposable', r.body.error === 'disposable_email', r);
r = await call(requestCode, { email: 'sophie@gmail.co', consent_info: true }); expect('typo suggestion', r.body.error === 'typo_suspected' && r.body.suggestion === 'sophie@gmail.com', r);
r = await call(requestCode, { email: 'a@nxdomain-zzz.com', consent_info: true }); expect('nxdomain', r.body.error === 'domain_no_mail', r);
r = await call(requestCode, { email: 'a@nomx.org', consent_info: true }); expect('no mx no A', r.body.error === 'domain_no_mail', r);
r = await call(requestCode, { email: ' Sophie.Tremblay@Gmail.com ', first_name: 'Sophie', role: 'parent', interest: 'campus', consent_info: true, consent_newsletter: true, consent_text: 'I agree', source_page: 'https://aimsummer.com/learn-more.html' });
expect('request ok', r.status === 200 && r.body.ok && r.body.email === 'sophie.tremblay@gmail.com' && r.body.masked.startsWith('so') && r.body.resend_in === 60, r);
expect('cors echo', r.cors === 'https://aimsummer.com', r);
expect('code email sent', sent.length === 1 && sent[0].to[0].email === 'sophie.tremblay@gmail.com' && /^Your AIM verification code: \d{6}$/.test(sent[0].subject) && sent[0].sender.email === 'hello@aimsummer.com', sent[0] && sent[0].subject);
const code = sent[0].subject.slice(-6);
expect('code stored hashed', db.tables.email_codes.length === 1 && db.tables.email_codes[0].code_hash.length === 64 && !JSON.stringify(db.tables.email_codes).includes(code));
r = await call(requestCode, { email: 'sophie.tremblay@gmail.com', consent_info: true }); expect('cooldown', r.status === 429 && r.body.error === 'cooldown' && r.body.retry_after > 0 && r.body.retry_after <= 60, r);
r = await call(verifyCode, { email: 'sophie.tremblay@gmail.com', code: '000000' === code ? '111111' : '000000' }); expect('wrong code', r.body.error === 'wrong_code' && r.body.attempts_left === 4, r);
r = await call(verifyCode, { email: 'sophie.tremblay@gmail.com', code: '12' }); expect('short code', r.body.error === 'invalid_code', r);
r = await call(verifyCode, { email: 'nobody@gmail.com', code: '123456' }); expect('unknown email', r.body.error === 'no_code', r);
r = await call(verifyCode, { email: 'Sophie.Tremblay@gmail.com', code: code.slice(0, 3) + ' ' + code.slice(3) });
expect('verify ok', r.status === 200 && r.body.ok && r.body.first_name === 'Sophie' && r.body.info_pack_sent === true, r);
const lead = db.tables.leads[0];
expect('lead verified', lead.status === 'verified' && lead.verified_at && lead.info_pack_sent_at && lead.notified_at && lead.brevo_contact_synced_at, lead);
expect('info pack via Gmail', gmail.sent.length === 1 && gmail.sent[0].to.includes('sophie.tremblay@gmail.com') && gmail.sent[0].from.includes('hello@aimsummer.com') && gmail.sent[0].subject === 'AIM at McGill — the details parents ask for' && gmail.sent[0].cfg.connection.hostname === 'smtp.gmail.com' && gmail.sent[0].cfg.connection.auth.password === 'abcdefghijklmnop', gmail.sent[0] && gmail.sent[0].subject);
expect('parent/campus wording', gmail.sent[0].html.includes('your child') && gmail.sent[0].html.includes('32 students maximum') && !gmail.sent[0].html.includes('<img') && (gmail.sent[0].html.match(/<a /g) || []).length <= 3, (gmail.sent[0].html.match(/<a /g) || []).length);
expect('2 more Brevo sends', sent.length === 3, sent.map(s => s.subject || 'contact'));
expect('notify', sent[1].to[0].email === 'hello@aimsummer.com' && sent[1].replyTo.email === 'sophie.tremblay@gmail.com' && sent[1].subject.includes('Sophie') && sent[1].subject.includes('Parent'), sent[1].subject);
expect('brevo contact', sent[2].contact && sent[2].contact.email === 'sophie.tremblay@gmail.com' && sent[2].contact.attributes.FIRSTNAME === 'Sophie', sent[2]);
r = await call(verifyCode, { email: 'sophie.tremblay@gmail.com', code }); expect('code single-use', r.body.error === 'no_code', r);
// second request for same email after cooldown: simulate by backdating the previous code
db.tables.email_codes[0].created_at = new Date(Date.now() - 120000).toISOString();
r = await call(requestCode, { email: 'sophie.tremblay@gmail.com', consent_info: true, role: 'student' }); expect('re-request ok', r.status === 200 && db.tables.leads.length === 1 && db.tables.leads[0].request_count === 2 && db.tables.leads[0].first_name === 'Sophie' && db.tables.leads[0].role === 'student', r);
// 5 wrong attempts cancel the code
const code2 = sent[sent.length - 1].subject.slice(-6);
let last;
for (let i = 0; i < 5; i++) last = await call(verifyCode, { email: 'sophie.tremblay@gmail.com', code: code2 === '999999' ? '888888' : '999999' });
expect('5 attempts cancel', last.body.error === 'too_many_attempts', last);
r = await call(verifyCode, { email: 'sophie.tremblay@gmail.com', code: code2 }); expect('cancelled code unusable', r.body.error === 'no_code', r);
// expiry
for (const c of db.tables.email_codes) c.created_at = new Date(Date.now() - 7200000).toISOString();
r = await call(requestCode, { email: 'sophie.tremblay@gmail.com', consent_info: true }); expect('request 3 ok', r.status === 200, r);
const live = db.tables.email_codes.find(c => !c.consumed_at); live.expires_at = new Date(Date.now() - 1000).toISOString();
r = await call(verifyCode, { email: 'sophie.tremblay@gmail.com', code: sent[sent.length - 1].subject.slice(-6) }); expect('expired', r.body.error === 'code_expired', r);
// hourly cap per email
for (const c of db.tables.email_codes) c.created_at = new Date(Date.now() - 1800000).toISOString();
r = await call(requestCode, { email: 'sophie.tremblay@gmail.com', consent_info: true });
for (const c of db.tables.email_codes) c.created_at = new Date(Date.now() - 1800000).toISOString();
r = await call(requestCode, { email: 'sophie.tremblay@gmail.com', consent_info: true }); expect('5th code allowed', r.status === 200, r);
for (const c of db.tables.email_codes) c.created_at = new Date(Date.now() - 1800000).toISOString();
r = await call(requestCode, { email: 'sophie.tremblay@gmail.com', consent_info: true }); expect('5 per hour cap', r.status === 429 && r.body.error === 'too_many_requests', { r, n: db.tables.email_codes.length });
// brevo failure on code email → 502 and code retired
r = await call(requestCode, { email: 'bounce@gmail.com', consent_info: true }); expect('brevo failure', r.status === 502 && r.body.error === 'email_failed' && db.tables.email_codes.filter(c => c.email === 'bounce@gmail.com' && !c.consumed_at).length === 0, r);
// Gmail down → the info pack falls back to Brevo (student / online variant)
gmail.fail = true;
r = await call(requestCode, { email: 'leo@videotron.ca', first_name: 'Léo', role: 'student', interest: 'online', consent_info: true });
expect('leo code', r.status === 200, r);
const leoCode = sent[sent.length - 1].subject.slice(-6);
r = await call(verifyCode, { email: 'leo@videotron.ca', code: leoCode });
const leoPack = sent.find(s => s.subject === 'Your two weeks with AIM, live online — how it really works');
expect('fallback to Brevo with student/online variant', r.body.ok && r.body.info_pack_sent === true && leoPack && leoPack.to[0].email === 'leo@videotron.ca' && leoPack.sender.name === 'Rami Jaouadi (AIM)' && leoPack.htmlContent.includes('Hi Léo') && leoPack.htmlContent.includes('1 – 3 pm'), { r, subjects: sent.map(s => s.subject) });
expect('fallback logged', db.tables.lead_events.some(e => e.type === 'info_pack_sent' && e.detail.transport === 'brevo' && e.detail.gmail_error), db.tables.lead_events.filter(e => e.type === 'info_pack_sent').map(e => e.detail));
gmail.fail = false;
// honeypot: logged, never blocking (browser autofill fills hidden fields for real people)
r = await call(requestCode, { email: 'trap-test@gmail.com', consent_info: true, website: 'http://spam' }); expect('honeypot logged, not blocking', r.status === 200 && r.body.ok === true && db.tables.lead_events.some(e => e.type === 'honeypot'), r);
// OPTIONS preflight
const pre = await requestCode(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: 'https://www.aimsummer.com' } })); expect('preflight', pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'https://www.aimsummer.com');
const bad = await requestCode(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } })); expect('foreign origin not echoed', bad.headers.get('access-control-allow-origin') === 'https://aimsummer.com');
console.log(`events: ${db.tables.lead_events.map(e => e.type).join(', ')}`);
console.log(`PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
