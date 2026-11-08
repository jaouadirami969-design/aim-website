// Local end-to-end tests for the two Edge Functions. Run: npm run test:functions (needs `npm install` once for typescript).
// Supabase and Brevo are faked in memory; nothing leaves this machine.
import { makeDb } from './fakedb.mjs';
const db = makeDb();
globalThis.__createClient = () => db.client;
const env = { SUPABASE_URL: 'x', SUPABASE_SERVICE_ROLE_KEY: 'service-key', BREVO_API_KEY: process.env.NO_BREVO ? undefined : 'test-key', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop', CRON_SECRET: 'cron-secret-123' };
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
await import('./.build/submit-application/index.mjs');
await import('./.build/confirm-application/index.mjs');
await import('./.build/save-draft/index.mjs');
await import('./.build/remind-drafts/index.mjs');
const [requestCode, verifyCode, submitApplication, confirmApplication, saveDraft, remindDrafts] = globalThis.__handlers;
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

// ---------------- the application (Mission 05) ----------------
gmail.sent.length = 0; sent.length = 0;
r = await call(requestCode, { email: 'maya.student@gmail.com', first_name: 'Maya', consent_info: true, purpose: 'apply' });
expect('apply: code requested', r.status === 200 && sent[0].subject.startsWith('Your AIM verification code') && sent[0].htmlContent.includes('continue your AIM application'), r);
const mayaCode = sent[0].subject.slice(-6);
r = await call(verifyCode, { email: 'maya.student@gmail.com', code: mayaCode, purpose: 'apply' });
expect('apply: verified with token, no info pack', r.status === 200 && r.body.ok && typeof r.body.token === 'string' && r.body.token.includes('.') && r.body.info_pack_sent === false && sent.length === 1 && gmail.sent.length === 0, r);
const token = r.body.token;
const base = {
  filled_by: 'student', student_first_name: 'Maya', student_last_name: 'Tremblay', student_dob: '2011-03-14', student_email: 'maya.student@gmail.com', student_phone: '',
  country: 'Canada', province: 'Québec', city: 'Montréal', postal_code: 'H3A 0G4',
  parent_first_name: 'Sophie', parent_last_name: 'Tremblay', parent_email: 'sophie.parent@gmail.com', parent_phone: '514-555-0199', parent_relationship: 'mother',
  program: 'finance-investment', level: 'beginner', format: 'campus', session_first: 's1', session_second: 's2', heard_about: 'Instagram',
  school_name: 'Collège Regina Assumpta', school_level: 'sec4', school_city: 'Montréal', school_province: 'Québec', english_ok: true,
  motivation: 'I want to understand how markets work and manage my own portfolio one day.', notes: '',
  consent_accuracy: true, consent_privacy: true, consent_parent: true, consent_newsletter: true, consent_text: 'test consent text', source_page: 'https://aimsummer.com/apply.html',
};
r = await call(submitApplication, { token: 'bad.token', application: base }); expect('apply: bad token', r.status === 401 && r.body.error === 'token_invalid', r);
r = await call(submitApplication, { token, application: { ...base, student_dob: '2016-01-01' } }); expect('apply: too young', r.status === 400 && r.body.error === 'age_out_of_range' && r.body.field === 'student_dob', r);
r = await call(submitApplication, { token, application: { ...base, student_dob: '2007-05-01' } }); expect('apply: too old', r.status === 400 && r.body.error === 'age_out_of_range', r);
r = await call(submitApplication, { token, application: { ...base, parent_email: 'maya.student@gmail.com' } }); expect('apply: parent email must differ', r.status === 400 && r.body.field === 'parent_email', r);
r = await call(submitApplication, { token, application: { ...base, english_ok: false } }); expect('apply: english box required', r.status === 400 && r.body.field === 'english_ok', r);
r = await call(submitApplication, { token, application: { ...base, level: 'intermediate' } }); expect('apply: intermediate needs previous year', r.status === 400 && r.body.field === 'previous_aim_year', r);
r = await call(submitApplication, { token, application: { ...base, consent_parent: false } }); expect('apply: parent consent box', r.status === 400 && r.body.field === 'consent_parent', r);
r = await call(submitApplication, { token, application: base });
expect('apply: submitted', r.status === 200 && r.body.ok && /^AIM-27-\d{4}$/.test(r.body.reference) && r.body.parent_email_sent === true && r.body.parent_consent_required === false, r);
const ref = r.body.reference;
const appRow = db.tables.applications[0];
expect('apply: stored', appRow && appRow.reference === ref && appRow.status === 'submitted' && appRow.student_age_at_program === 16 && appRow.applicant_email === 'maya.student@gmail.com' && appRow.parent_confirm_token_hash && !appRow.parent_confirmed_at, appRow);
const parentMail = gmail.sent.find(m => m.subject.includes('please confirm'));
const applicantMail = gmail.sent.find(m => m.subject.startsWith('Application received'));
const teamMail = sent.find(m => m.subject && m.subject.startsWith('New application'));
expect('apply: 3 emails', parentMail && parentMail.to.includes('sophie.parent@gmail.com') && applicantMail && applicantMail.to.includes('maya.student@gmail.com') && teamMail && teamMail.to[0].email === 'hello@aimsummer.com' && teamMail.replyTo.email === 'maya.student@gmail.com', { gmail: gmail.sent.map(m => m.subject), brevo: sent.map(m => m.subject) });
expect('apply: emails mention the reference', applicantMail.html.includes(ref) && teamMail.subject.includes(ref) && teamMail.htmlContent.includes('Collège Regina Assumpta'), ref);
const link = parentMail.html.match(/href="[^"]*application-confirmed\.html\?ref=([^&"]+)&(?:amp;)?t=([A-Za-z0-9_-]+)"/);
expect('apply: parent link present', !!link, parentMail.html.slice(0, 200));
const confirmToken = decodeURIComponent(link[2]);
r = await call(confirmApplication, { ref, t: 'wrong' }); expect('confirm: wrong token', r.status === 400 && r.body.error === 'token_invalid', r);
r = await call(confirmApplication, { ref: 'AIM-27-9999', t: confirmToken }); expect('confirm: unknown ref', r.status === 404, r);
r = await call(confirmApplication, { ref, t: confirmToken }); expect('confirm: ok', r.status === 200 && r.body.ok && r.body.already_confirmed === false && r.body.student_first_name === 'Maya' && db.tables.applications[0].parent_confirmed_at, r);
r = await call(confirmApplication, { ref: ref.toLowerCase(), t: confirmToken }); expect('confirm: idempotent', r.status === 200 && r.body.already_confirmed === true, r);
// a parent filling in for a 13-year-old: no parent email, consent flag set
gmail.sent.length = 0; sent.length = 0;
r = await call(requestCode, { email: 'papa.khan@gmail.com', first_name: 'Omar', consent_info: true, purpose: 'apply' });
r = await call(verifyCode, { email: 'papa.khan@gmail.com', code: sent[0].subject.slice(-6), purpose: 'apply' });
const young = new Date(); young.setUTCFullYear(young.getUTCFullYear() - 13); young.setUTCDate(young.getUTCDate() - 100); // 13 today (Law 25), 13 during the program
const dobYoung = young.toISOString().slice(0, 10);
r = await call(submitApplication, { token: r.body.token, application: { ...base, filled_by: 'parent', student_first_name: 'Zara', student_last_name: 'Khan', student_dob: dobYoung, student_email: 'zara.khan@gmail.com', parent_first_name: 'Omar', parent_last_name: 'Khan', parent_email: 'papa.khan@gmail.com', format: 'online', session_first: 'flexible', session_second: 'none', motivation: '' } });
expect('apply: parent-filled, under 14', r.status === 200 && r.body.parent_email_sent === false && r.body.student_copy_sent === true && r.body.parent_consent_required === true && db.tables.applications[1].parent_confirmed_at && !db.tables.applications[1].parent_confirm_token_hash, r);
expect('apply: team alert flags Law 25', sent.some(m => m.subject && m.subject.startsWith('New application') && m.htmlContent.includes('under 14')), sent.map(m => m.subject));

// ---------------- drafts: save, resume on another device, delete on submit, 48 h reminder ----------------
gmail.sent.length = 0; sent.length = 0;
r = await call(requestCode, { email: 'nadia.b@gmail.com', consent_info: true, purpose: 'apply' });
r = await call(verifyCode, { email: 'nadia.b@gmail.com', code: sent[0].subject.slice(-6), purpose: 'apply' });
expect('draft: none yet on first verification', r.status === 200 && r.body.draft === null, r.body);
const nadiaToken = r.body.token;
r = await call(saveDraft, { token: 'nope', draft: { step: 'student', data: { a: 1 } } }); expect('draft: bad token', r.status === 401, r);
r = await call(saveDraft, { token: nadiaToken, draft: { step: 'student', data: 'not an object' } }); expect('draft: invalid data', r.status === 400, r);
const draftData = { filled_by: 'parent', student_first_name: 'Inès', student_last_name: 'B.', parent_first_name: 'Nadia', code: '123456', aim_hp: true, nested: { x: 1 }, 'Bad Key': 'x', long: 'y'.repeat(5000), consent_newsletter: true, n: 3 };
r = await call(saveDraft, { token: nadiaToken, draft: { step: 'parent', data: draftData, savedAt: Date.now() - 5000 } });
const drow = db.tables.application_drafts.find(d => d.email === 'nadia.b@gmail.com');
expect('draft: saved and cleaned', r.status === 200 && r.body.ok && drow && drow.step === 'parent' && drow.data.student_first_name === 'Inès' && drow.data.code === undefined && drow.data.aim_hp === undefined && drow.data.nested === undefined && drow.data['Bad Key'] === undefined && drow.data.long.length === 2000 && drow.data.consent_newsletter === true && drow.data.n === 3, drow && Object.keys(drow.data));
r = await call(saveDraft, { token: nadiaToken, draft: { step: 'program', data: { ...draftData, format: 'online' }, savedAt: Date.now() } });
expect('draft: upsert keeps one row per email', db.tables.application_drafts.filter(d => d.email === 'nadia.b@gmail.com').length === 1 && drow.step === 'program' && drow.data.format === 'online', db.tables.application_drafts.length);
// another device: verify again → the draft comes back
for (const c of db.tables.email_codes) c.created_at = new Date(Date.now() - 120000).toISOString();
r = await call(requestCode, { email: 'nadia.b@gmail.com', consent_info: true, purpose: 'apply' });
r = await call(verifyCode, { email: 'nadia.b@gmail.com', code: sent[sent.length - 1].subject.slice(-6), purpose: 'apply' });
expect('draft: returned on the next verification (other device)', r.status === 200 && r.body.draft && r.body.draft.step === 'program' && r.body.draft.data.student_first_name === 'Inès' && typeof r.body.draft.savedAt === 'number', r.body.draft);
// reminders: nothing due yet (updated just now)
r = await call(remindDrafts, {}, { 'x-cron-secret': 'wrong' }); expect('remind: wrong secret', r.status === 401, r);
r = await call(remindDrafts, {}, { 'x-cron-secret': 'cron-secret-123' }); expect('remind: nothing due', r.status === 200 && r.body.due === 0 && r.body.sent === 0, r.body);
// backdate the draft 3 days → one reminder, personal, with the link; never twice
drow.updated_at = new Date(Date.now() - 3 * 86400000).toISOString();
sent.length = 0;
r = await call(remindDrafts, { secret: 'cron-secret-123' });
const rem = sent.find(m => m.tags && m.tags.includes('aim-apply-reminder'));
expect('remind: one reminder sent', r.status === 200 && r.body.due === 1 && r.body.sent === 1 && rem && rem.to[0].email === 'nadia.b@gmail.com' && rem.to[0].name === 'Nadia' && rem.sender.name === 'Rami Jaouadi (AIM)' && drow.reminded_at, { body: r.body, subjects: sent.map(m => m.subject) });
expect('remind: content', rem && rem.subject === "Inès's AIM application is saved — finish it in 5 minutes" && rem.htmlContent.includes('Hi Nadia') && rem.htmlContent.includes('apply.html?resume=1') && rem.htmlContent.includes('step 4 (your program)') && rem.textContent.includes('https://aimsummer.com/apply.html?resume=1'), rem && rem.subject);
r = await call(remindDrafts, {}, { 'x-cron-secret': 'cron-secret-123' }); expect('remind: never twice', r.body.due === 0 && r.body.sent === 0, r.body);
expect('remind: event logged', db.tables.lead_events.some(e => e.type === 'draft_reminder_sent' && e.email === 'nadia.b@gmail.com'));
// purge: a draft untouched for 61 days disappears
db.tables.application_drafts.push({ email: 'old@gmail.com', data: { student_first_name: 'Old' }, step: 'student', saved_at: new Date().toISOString(), reminded_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date(Date.now() - 61 * 86400000).toISOString() });
r = await call(remindDrafts, {}, { 'x-cron-secret': 'cron-secret-123' }); expect('remind: purge after 60 days', r.body.purged === 1 && !db.tables.application_drafts.some(d => d.email === 'old@gmail.com'), r.body);
// submitting deletes the draft
r = await call(submitApplication, { token: nadiaToken, application: { ...base, filled_by: 'parent', student_first_name: 'Inès', student_last_name: 'Bensaid', student_email: '', parent_first_name: 'Nadia', parent_last_name: 'Bensaid', parent_email: 'nadia.b@gmail.com' } });
expect('draft: deleted once the application is submitted', r.status === 200 && !db.tables.application_drafts.some(d => d.email === 'nadia.b@gmail.com'), { status: r.status, body: r.body, drafts: db.tables.application_drafts.map(d => d.email) });
r = await call(saveDraft, { token: nadiaToken, delete: true }); expect('draft: explicit delete is fine when nothing is left', r.status === 200 && r.body.deleted === true, r);

// honeypot: logged, never blocking (browser autofill fills hidden fields for real people)
r = await call(requestCode, { email: 'trap-test@gmail.com', consent_info: true, website: 'http://spam' }); expect('honeypot logged, not blocking', r.status === 200 && r.body.ok === true && db.tables.lead_events.some(e => e.type === 'honeypot'), r);
// OPTIONS preflight
const pre = await requestCode(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: 'https://www.aimsummer.com' } })); expect('preflight', pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'https://www.aimsummer.com');
const bad = await requestCode(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } })); expect('foreign origin not echoed', bad.headers.get('access-control-allow-origin') === 'https://aimsummer.com');
console.log(`events: ${db.tables.lead_events.map(e => e.type).join(', ')}`);
console.log(`PASS ${pass}  FAIL ${fail}`);
process.exit(fail ? 1 : 0);
