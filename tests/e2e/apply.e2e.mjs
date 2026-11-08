#!/usr/bin/env node
/**
 * End-to-end test of the application wizard (apply.html) with a MOCKED API — no emails, no database.
 *
 *   npm run build && (python3 -m http.server 4100 -d dist &) && node tests/e2e/apply.e2e.mjs
 *
 * Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium) — or set
 * PLAYWRIGHT_PATH to an existing installation. Screenshots land in tests/e2e/shots/.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(here, 'shots');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4100';
const pw = await import(process.env.PLAYWRIGHT_PATH || 'playwright');

let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failures++; };

const b64url = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fakeToken = (email) => `${b64url(JSON.stringify({ e: email, p: 'apply', x: Math.floor(Date.now() / 1000) + 7200 }))}.deadbeef`;

/** Install the fake API on a page. `overrides` lets a test change one endpoint's answer. */
async function mockApi(page, overrides = {}) {
  const calls = [];
  await page.route('**/functions/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const fn = url.pathname.split('/').pop();
    let body = {};
    try { body = route.request().postDataJSON(); } catch { /* empty */ }
    calls.push({ fn, body });
    const reply = (status, json) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(json) });
    if (overrides[fn]) { const r = overrides[fn](body, calls); return reply(r.status || 200, r.json); }
    if (fn === 'request-code') return reply(200, { ok: true, email: body.email, masked: 'ra••••@example.org', expires_in: 600, resend_in: 60, max_attempts: 5 });
    if (fn === 'verify-code') return reply(200, { ok: true, email: body.email, first_name: '', info_pack_sent: false, token: fakeToken(body.email) });
    if (fn === 'save-draft') return reply(200, { ok: true });
    if (fn === 'submit-application') return reply(200, { ok: true, reference: 'AIM-27-1001', student_first_name: body.application.student_first_name, parent_email_sent: body.application.filled_by === 'student' || body.application.parent_email !== body.token_email, student_copy_sent: false, parent_consent_required: false });
    if (fn === 'confirm-application') return reply(200, { ok: true, reference: body.ref, student_first_name: 'Léa', parent_first_name: 'Nadia', already_confirmed: false });
    return reply(404, { ok: false, error: 'not_found', message: 'no such function' });
  });
  return calls;
}

function watchErrors(page, bag) {
  page.on('pageerror', (e) => bag.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) bag.push(`console: ${m.text()}`); });
}

const shot = async (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

/* --------------------------------------------------------------------------- the student fills in everything */
async function fillStudentFlow(page, { filledBy = 'student', dobYear = '2012', shots = false, tag = 'desktop' } = {}) {
  await page.goto(`${BASE}/apply.html`);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(`${BASE}/apply.html?format=campus`);
  if (shots) await shot(page, `${tag}-0-start`);

  await page.click(`label.choice:has(input[name="filled_by"][value="${filledBy}"])`);
  await page.click('.ap__step[data-step="start"] button[type="submit"]');
  await page.waitForSelector('#ap-email:visible');
  if (shots) await shot(page, `${tag}-1-email`);

  await page.fill('#f-applicant-email', 'rami.test@example.org');
  await page.check('#ap-email input[name="consent_info"]');
  await page.click('#ap-email button[type="submit"]');
  await page.waitForSelector('#ap-code:visible');
  if (shots) await shot(page, `${tag}-1b-code`);
  await page.fill('#ap-code-input', '123456');
  await page.waitForSelector('.ap__step[data-step="student"]:visible', { timeout: 5000 });
  if (shots) await shot(page, `${tag}-2-student-empty`);

  await page.fill('#f-student-first', 'Léa');
  await page.fill('#f-student-last', 'Tremblay');
  await page.selectOption('#f-dob-m', '03');
  await page.selectOption('#f-dob-d', '14');
  await page.selectOption('#f-dob-y', dobYear);
  await page.selectOption('#f-province', 'Quebec');
  await page.fill('#f-city', 'Montréal');
  await page.fill('#f-postal', 'h3a0g4');
  if (filledBy === 'parent') await page.fill('#f-student-email', 'lea@example.org');
  if (shots) await shot(page, `${tag}-2-student`);
  await page.click('.ap__step[data-step="student"] button[type="submit"]');
  await page.waitForSelector('.ap__step[data-step="parent"]:visible');

  await page.fill('#f-parent-first', 'Nadia');
  await page.fill('#f-parent-last', 'Tremblay');
  if (filledBy === 'student') await page.fill('#f-parent-email', 'nadia@example.org');
  await page.fill('#f-parent-phone', '514 555 0123');
  await page.click('label.pill:has(input[value="mother"])');
  if (shots) await shot(page, `${tag}-3-parent`);
  await page.click('.ap__step[data-step="parent"] button[type="submit"]');
  await page.waitForSelector('.ap__step[data-step="program"]:visible');

  // format came from the deep link; choose the session and how they heard about us
  await page.click('label.choice:has(input[name="session_first"][value="s1"])');
  await page.selectOption('#f-session-second', 's2');
  await page.selectOption('#f-heard', 'Instagram');
  if (shots) await shot(page, `${tag}-4-program`);
  await page.click('.ap__step[data-step="program"] button[type="submit"]');
  await page.waitForSelector('.ap__step[data-step="school"]:visible');

  await page.fill('#f-school', 'Collège Jean-de-Brébeuf');
  await page.selectOption('#f-school-level', 'sec3');
  await page.fill('#f-school-city', 'Montréal');
  await page.check('input[name="english_ok"]');
  if (shots) await shot(page, `${tag}-5-school`);
  await page.click('.ap__step[data-step="school"] button[type="submit"]');
  await page.waitForSelector('.ap__step[data-step="why"]:visible');

  await page.fill('#f-motivation', 'I follow the markets with my dad and I want to understand what actually moves a stock price.');
  await page.check('input[name="consent_accuracy"]');
  await page.check('input[name="consent_privacy"]');
  await page.check('input[name="consent_parent"]');
  if (shots) await shot(page, `${tag}-6-why`);
  await page.click('.ap__step[data-step="why"] button[type="submit"]');
  await page.waitForSelector('.ap__step[data-step="review"]:visible');
  if (shots) await shot(page, `${tag}-7-review`);
}

async function main() {
  await fs.mkdir(SHOTS, { recursive: true });
  const browser = await pw.chromium.launch();

  /* ---- 1. the happy path, desktop, with screenshots */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = []; watchErrors(page, errors);
    const calls = await mockApi(page);
    await fillStudentFlow(page, { shots: true });

    const review = await page.textContent('[data-review]');
    ok(review.includes('Léa Tremblay') && review.includes('March 14, 2012') && review.includes('H3A 0G4') && review.includes('Nadia Tremblay') && review.includes('Session 1'), 'review shows the answers (name, DOB, postal code, parent, session)');
    ok(review.includes('McGill campus'), 'deep link ?format=campus pre-selected the campus format');
    ok(review.includes('(15 during the program)'), 'age during the program is computed (born 2012-03-14 → 15 on 2027-06-28)');

    const rc = calls.find((c) => c.fn === 'request-code');
    ok(rc && rc.body.purpose === 'apply' && rc.body.consent_info === true && rc.body.role === 'student' && rc.body.interest === 'campus', 'request-code is called with purpose=apply, consent, role and interest');
    const vc = calls.find((c) => c.fn === 'verify-code');
    ok(vc && vc.body.purpose === 'apply' && vc.body.code === '123456', 'verify-code is called with purpose=apply and the code');
    await page.waitForTimeout(400);
    ok(calls.some((c) => c.fn === 'save-draft' && c.body.token && c.body.draft && c.body.draft.data && c.body.draft.data.student_first_name === 'Léa'), 'the draft is also saved on the server once the email is verified');

    await page.click('.ap__step[data-step="review"] button[type="submit"]');
    await page.waitForURL('**/application-received.html', { timeout: 8000 });
    const sub = calls.find((c) => c.fn === 'submit-application');
    const a = sub && sub.body.application;
    ok(Boolean(sub && sub.body.token), 'submit-application carries the token');
    ok(a && a.student_dob === '2012-03-14' && a.postal_code === 'H3A 0G4' && a.province === 'Quebec' && a.country === 'Canada', 'application payload: DOB, normalized postal code, province, country');
    ok(a && a.filled_by === 'student' && a.student_email === 'rami.test@example.org' && a.parent_email === 'nadia@example.org' && a.parent_relationship === 'mother', 'application payload: filled_by, prefilled student email, parent, relationship');
    ok(a && a.program === 'finance-investment' && a.level === 'beginner' && a.format === 'campus' && a.session_first === 's1' && a.session_second === 's2' && a.heard_about === 'Instagram', 'application payload: program, level, format, sessions, heard_about');
    ok(a && a.school_name === 'Collège Jean-de-Brébeuf' && a.school_level === 'sec3' && a.school_province === 'Quebec' && a.english_ok === true, 'application payload: school (province prefilled from the student address)');
    ok(a && a.consent_accuracy && a.consent_privacy && a.consent_parent && a.consent_newsletter === false && typeof a.consent_text === 'string' && a.consent_text.includes('accurate') && !a.consent_text.includes('your child'), 'application payload: the three consents, newsletter left unticked, consent text in the student voice only');

    const h1 = await page.textContent('[data-ty-name]');
    const ref = await page.textContent('[data-ty-ref-value]');
    ok(h1.includes('Léa') && ref === 'AIM-27-1001', `received page is personalized: "${h1.trim()}" · ${ref}`);
    const parentNote = await page.textContent('[data-ty-parent-text]');
    ok(parentNote.includes('nadia@example.org'), 'received page mentions the parent confirmation email');
    const draftLeft = await page.evaluate(() => localStorage.getItem('aim.apply.draft.v1'));
    ok(draftLeft === null, 'the local draft is cleared after a successful submission');
    await shot(page, 'desktop-8-received');
    ok(errors.length === 0, `no JS errors on the happy path${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await ctx.close();
  }

  /* ---- 2. validation: empty student step, bad age, bad postal code, parent email = own email */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = []; watchErrors(page, errors);
    await mockApi(page);
    await page.goto(`${BASE}/apply.html`);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.click('.ap__step[data-step="start"] button[type="submit"]');
    ok(await page.isVisible('.ap__step[data-step="start"] .fld__err:not([hidden])'), 'start: "who is filling" is required');
    await page.click('label.choice:has(input[name="filled_by"][value="student"])');
    await page.click('.ap__step[data-step="start"] button[type="submit"]');
    await page.click('#ap-email button[type="submit"]');
    const emailErr = await page.textContent('[data-field="applicant_email"] .fld__err');
    ok(emailErr.includes('valid email'), 'email step: empty email is explained');
    await page.fill('#f-applicant-email', 'rami.test@example.org');
    await page.click('#ap-email button[type="submit"]');
    ok((await page.textContent('[data-err-for="consent_info"]')).includes('tick the box'), 'email step: the consent box is required');
    await page.check('#ap-email input[name="consent_info"]');
    await page.click('#ap-email button[type="submit"]');
    await page.waitForSelector('#ap-code:visible');
    await page.fill('#ap-code-input', '123456');
    await page.waitForSelector('.ap__step[data-step="student"]:visible');

    await page.click('.ap__step[data-step="student"] button[type="submit"]');
    const summary = await page.textContent('.ap__step[data-step="student"] .form-status');
    const nErr = await page.$$eval('.ap__step[data-step="student"] .fld__err:not([hidden])', (els) => els.length);
    ok(/fix the \d+ fields/.test(summary) && nErr >= 5, `student step: error summary + ${nErr} field errors`);
    await shot(page, 'desktop-errors-student');

    await page.fill('#f-student-first', 'Max');
    await page.fill('#f-student-last', 'Roy');
    await page.selectOption('#f-dob-m', '01'); await page.selectOption('#f-dob-d', '10'); await page.selectOption('#f-dob-y', '2016');
    const note = await page.textContent('[data-age-note]');
    await page.click('.ap__step[data-step="student"] button[type="submit"]');
    const dobErr = await page.textContent('[data-field="student_dob"] > .fld__err');
    ok(dobErr.includes('Max would be 11'), `age rule: "${dobErr.slice(0, 80)}…"`);
    await page.selectOption('#f-dob-y', '2014');
    const note2 = await page.textContent('[data-age-note]');
    ok(note2.includes('will be 13') && note2.includes('under 14 today'), `age note live: "${note2}"`);
    ok(await page.isHidden('[data-newsletter]'), 'newsletter box hidden for a student under 14 (Law 25)');
    await page.selectOption('#f-dob-y', '2010');
    ok(await page.isVisible('[data-newsletter]'), 'newsletter box shown once the student is 14+');
    await page.selectOption('#f-province', 'Quebec');
    await page.fill('#f-city', 'Laval');
    await page.fill('#f-postal', '12345');
    await page.click('.ap__step[data-step="student"] button[type="submit"]');
    ok((await page.textContent('[data-field="postal_code"] .fld__err')).includes('H3A 0G4'), 'postal code rule for Canada');
    await page.selectOption('#f-country', 'United States');
    ok((await page.textContent('[data-province-label]')) === 'State' && (await page.textContent('[data-postal-label]')) === 'ZIP code', 'country switch → State / ZIP code labels');
    await page.selectOption('#f-province', 'Vermont');
    await page.click('.ap__step[data-step="student"] button[type="submit"]');
    await page.waitForSelector('.ap__step[data-step="parent"]:visible');

    await page.fill('#f-parent-first', 'Nadia'); await page.fill('#f-parent-last', 'Roy');
    await page.fill('#f-parent-email', 'rami.test@example.org');
    await page.fill('#f-parent-phone', '555-0123');
    await page.click('.ap__step[data-step="parent"] button[type="submit"]');
    ok(/different|verified for yourself/.test(await page.textContent('[data-field="parent_email"] .fld__err')), 'parent email must differ from the student\'s / the verified email');
    ok((await page.textContent('[data-field="parent_phone"] .fld__err')).includes('10 digits'), 'parent phone needs 10 digits');
    ok((await page.textContent('[data-field="parent_relationship"] .fld__err')).includes('related'), 'relationship is required');
    ok(errors.length === 0, `no JS errors during validation${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await ctx.close();
  }

  /* ---- 3. resume after a reload (autosave), then "Edit" from the review returns to the review */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = []; watchErrors(page, errors);
    await mockApi(page);
    await fillStudentFlow(page);
    await page.reload();
    await page.waitForSelector('[data-resume]:not([hidden])');
    const txt = await page.textContent('[data-resume-text]');
    ok(txt.includes('saved on this device'), `resume banner after reload: "${txt}"`);
    await shot(page, 'desktop-resume');
    await page.click('[data-resume-continue]');
    await page.waitForSelector('.ap__step[data-step="review"]:visible');
    const review = await page.textContent('[data-review]');
    ok(review.includes('Léa Tremblay') && review.includes('Collège Jean-de-Brébeuf'), 'resume restores every answer and lands on the review');
    await page.click('[data-edit="parent"]');
    await page.waitForSelector('.ap__step[data-step="parent"]:visible');
    await page.fill('#f-parent-phone', '438-555-9999');
    await page.click('.ap__step[data-step="parent"] button[type="submit"]');
    await page.waitForSelector('.ap__step[data-step="review"]:visible');
    ok((await page.textContent('[data-review]')).includes('438-555-9999'), '"Edit" from the review → fix → straight back to the review');
    // progress pips: going back is allowed
    await page.click('.ap__pip[data-go="student"]');
    await page.waitForSelector('.ap__step[data-step="student"]:visible');
    ok(await page.isVisible('.ap__step[data-step="student"]'), 'progress pips navigate back to a completed step');
    ok(errors.length === 0, `no JS errors on resume${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await ctx.close();
  }

  /* ---- 4. server-side errors: a field error lands on the right step; an expired token re-verifies then returns to the review */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = []; watchErrors(page, errors);
    let submits = 0;
    await mockApi(page, {
      'submit-application': (body) => {
        submits++;
        if (submits === 1) return { status: 400, json: { ok: false, error: 'invalid_field', field: 'parent_email', message: 'The parent or guardian\'s email must be different from the student\'s email.' } };
        if (submits === 2) return { status: 401, json: { ok: false, error: 'token_invalid', message: 'Your email verification has expired.' } };
        return { status: 200, json: { ok: true, reference: 'AIM-27-1002', student_first_name: body.application.student_first_name, parent_email_sent: true, student_copy_sent: false, parent_consent_required: false } };
      },
    });
    await fillStudentFlow(page);
    await page.click('.ap__step[data-step="review"] button[type="submit"]');
    await page.waitForSelector('.ap__step[data-step="parent"]:visible');
    ok((await page.textContent('[data-field="parent_email"] .fld__err')).includes('different'), 'server field error → the parent step, with the message under the field');
    await page.fill('#f-parent-email', 'nadia2@example.org');
    await page.click('.ap__step[data-step="parent"] button[type="submit"]');
    await page.waitForSelector('.ap__step[data-step="review"]:visible');
    await page.click('.ap__step[data-step="review"] button[type="submit"]');
    await page.waitForSelector('#ap-email:visible');
    ok((await page.textContent('#ap-email .form-status')).includes('expired'), 'expired token → back to the email step with an explanation');
    ok((await page.inputValue('#f-applicant-email')) === 'rami.test@example.org', 'the email is prefilled for re-verification');
    await page.check('#ap-email input[name="consent_info"]');
    await page.click('#ap-email button[type="submit"]');
    await page.waitForSelector('#ap-code:visible');
    await page.fill('#ap-code-input', '654321');
    await page.waitForSelector('.ap__step[data-step="review"]:visible', { timeout: 5000 });
    ok(true, 'after re-verifying, the wizard returns to the review');
    await page.click('.ap__step[data-step="review"] button[type="submit"]');
    await page.waitForURL('**/application-received.html');
    ok((await page.textContent('[data-ty-ref-value]')) === 'AIM-27-1002', 'third attempt succeeds');
    ok(errors.length === 0, `no JS errors on server-error paths${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await ctx.close();
  }

  /* ---- 5. a parent fills it in, for a 12-year-old: Law 25 note, parent email prefilled, newsletter visible */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = []; watchErrors(page, errors);
    const calls = await mockApi(page);
    await fillStudentFlow(page, { filledBy: 'parent', dobYear: '2014' });
    const review = await page.textContent('[data-review]');
    ok(review.includes('A parent or guardian') && review.includes('rami.test@example.org'), 'parent flow: parent email prefilled with the verified email');
    await page.click('[data-edit="parent"]');
    await page.waitForSelector('.ap__step[data-step="parent"]:visible');
    ok(await page.isVisible('[data-law25]'), 'parent flow: Law 25 note shown for a student under 14');
    const law = await page.textContent('[data-law25]');
    ok(law.includes('Léa') && law.includes('Nadia'), `Law 25 note uses the names: "${law.replace(/\s+/g, ' ').trim().slice(0, 90)}…"`);
    await page.click('.ap__pip[data-go="student"]');
    await page.waitForSelector('.ap__step[data-step="student"]:visible');
    ok(await page.isVisible('[data-newsletter]'), 'parent flow: the newsletter box is offered to the parent even if the student is under 14');
    const voice = await page.textContent('.ap__step[data-step="student"] .ap__intro');
    ok(voice.includes('your child'), 'parent flow: the wording speaks to the parent ("your child")');
    await page.click('.ap__pip[data-go="review"]');
    await page.waitForSelector('.ap__step[data-step="review"]:visible');
    await page.click('.ap__step[data-step="review"] button[type="submit"]');
    await page.waitForURL('**/application-received.html');
    const sub = calls.find((c) => c.fn === 'submit-application');
    ok(sub.body.application.filled_by === 'parent' && sub.body.application.parent_email === 'rami.test@example.org' && sub.body.application.student_email === 'lea@example.org', 'parent flow payload');
    ok(errors.length === 0, `no JS errors in the parent flow${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await ctx.close();
  }

  /* ---- 6. the parent's confirmation page */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = []; watchErrors(page, errors);
    let n = 0;
    await mockApi(page, {
      'confirm-application': (body) => {
        n++;
        if (body.t === 'bad') return { status: 400, json: { ok: false, error: 'token_invalid', message: "This confirmation link isn't valid." } };
        if (body.ref === 'AIM-27-0000') return { status: 404, json: { ok: false, error: 'not_found', message: "We can't find this application." } };
        return { status: 200, json: { ok: true, reference: body.ref, student_first_name: 'Léa', parent_first_name: 'Nadia', already_confirmed: n > 1 } };
      },
    });
    await page.goto(`${BASE}/application-confirmed.html?ref=AIM-27-1001&t=abc`);
    await page.waitForSelector('.confirm[data-state="ok"]');
    const t1 = await page.textContent('[data-title]');
    ok(t1.includes('Nadia') && t1.includes('Léa') && (await page.textContent('[data-ref-value]')) === 'AIM-27-1001', `confirmation ok: "${t1}"`);
    await shot(page, 'desktop-confirmed');
    await page.goto(`${BASE}/application-confirmed.html?ref=AIM-27-1001&t=abc`);
    await page.waitForSelector('.confirm[data-state="already"]');
    ok((await page.textContent('[data-title]')).includes('already confirmed'), 'second click → "already confirmed"');
    await page.goto(`${BASE}/application-confirmed.html?ref=AIM-27-1001&t=bad`);
    await page.waitForSelector('.confirm[data-state="invalid"]');
    ok((await page.textContent('[data-text]')).includes("isn't valid"), 'invalid token → explained');
    await page.goto(`${BASE}/application-confirmed.html`);
    await page.waitForSelector('.confirm[data-state="invalid"]');
    ok((await page.textContent('[data-title]')).includes('incomplete'), 'missing parameters → "link is incomplete"');
    ok(errors.length === 0, `no JS errors on the confirmation page${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await ctx.close();
  }

  /* ---- 7. mobile: the whole flow at 390 px, with screenshots */
  {
    const ctx = await browser.newContext({ ...pw.devices['iPhone 13'] });
    const page = await ctx.newPage();
    const errors = []; watchErrors(page, errors);
    await mockApi(page);
    await fillStudentFlow(page, { shots: true, tag: 'mobile' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!overflow, 'mobile: no horizontal overflow on the review step');
    ok(await page.isVisible('[data-mobile-progress]'), 'mobile: compact progress ("Step x of 6") is shown');
    await page.click('.ap__step[data-step="review"] button[type="submit"]');
    await page.waitForURL('**/application-received.html');
    await shot(page, 'mobile-8-received');
    ok(errors.length === 0, `no JS errors on mobile${errors.length ? `: ${errors.join(' | ')}` : ''}`);
    await ctx.close();
  }

  await browser.close();
  console.log(failures ? `\n✖ ${failures} failure(s)` : '\n✔ all e2e checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
