/* AIM website — the guided application ("Apply now"), no dependencies.
   Steps: start → email (6-digit code) → student → parent → program → school → why → review → submit.
     POST {api}/request-code        { purpose:"apply", … }   → a code is emailed from hello@aimsummer.com
     POST {api}/verify-code         { purpose:"apply", … }   → { token } = signed proof of the verified email (2 h)
     POST {api}/save-draft          { token, draft }          → the answers are also kept server-side (resume on any device)
     POST {api}/submit-application  { token, application }   → { reference } → application-received.html
   Every answer is saved on this device as you type (localStorage), so a closed tab loses nothing. */
(() => {
  'use strict';

  const RESULT_KEY = 'aim.apply.result.v1';

  /* ================================================================== shared: one POST helper for the three pages */
  async function postTo(api, path, body, timeoutMs, contact) {
    if (!api) return { status: 0, data: { ok: false, error: 'not_configured', message: `This page isn't connected yet. Please email us at ${contact}.` } };
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 25000);
    try {
      const res = await fetch(`${api}/${path}`, {
        method: 'POST', mode: 'cors', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      let out = {};
      try { out = await res.json(); } catch { /* no body */ }
      if (!out || typeof out !== 'object') out = {};
      if (!('ok' in out)) out.ok = res.ok;
      if (!out.ok && !out.message) out.message = `Something went wrong (HTTP ${res.status}). Please try again, or email us at ${contact}.`;
      return { status: res.status, data: out };
    } catch (err) {
      const timedOut = err && err.name === 'AbortError';
      return { status: 0, data: { ok: false, error: 'network', message: timedOut ? 'The request took too long. Check your connection and try again — your answers are saved.' : `We couldn't reach our server. Check your connection and try again — your answers are saved. If it keeps failing, email us at ${contact}.` } };
    } finally {
      clearTimeout(t);
    }
  }

  /* ================================================================== page: application-received.html */
  const received = document.querySelector('[data-app-received]');
  if (received) {
    let r = null;
    try { r = JSON.parse(sessionStorage.getItem(RESULT_KEY) || 'null'); } catch { r = null; }
    const nameEl = received.querySelector('[data-ty-name]');
    if (r && r.reference) {
      const first = r.student_first_name || '';
      if (nameEl) nameEl.textContent = r.filled_by === 'parent' ? `Thank you${first ? ` — ${first}'s application is in` : ''}!` : `Thank you${first ? `, ${first}` : ''}!`;
      const emailEl = received.querySelector('[data-ty-email]');
      if (emailEl) emailEl.textContent = r.applicant_email || 'your inbox';
      const refBox = received.querySelector('[data-ty-ref]');
      if (refBox) { refBox.hidden = false; refBox.querySelector('[data-ty-ref-value]').textContent = r.reference; }
      const parentBox = document.querySelector('[data-ty-parent]');
      if (parentBox) {
        const txt = parentBox.querySelector('[data-ty-parent-text]');
        if (r.parent_email_sent && r.parent_email) {
          parentBox.hidden = false;
          txt.textContent = `We've also emailed ${r.parent_email} a copy of this application with a one-click confirmation link${r.parent_consent_required ? ' — required by Quebec’s privacy law (Law 25) because the student is under 14' : ''}. The application is complete once that link is clicked.`;
        } else if (r.filled_by === 'parent' && r.student_copy_sent && r.student_email) {
          parentBox.hidden = false;
          parentBox.querySelector('h3').textContent = 'A copy for the student';
          txt.textContent = `${r.student_first_name || 'The student'} also received a copy at ${r.student_email}.`;
        }
      }
    } else {
      received.querySelectorAll('[data-ty-has-email]').forEach((el) => { el.hidden = true; });
    }
  }

  /* ================================================================== page: application-confirmed.html (the parent's one click) */
  const confirmBox = document.querySelector('[data-app-confirm]');
  if (confirmBox) {
    const api = (confirmBox.dataset.api || '').replace(/\/$/, '');
    const contact = confirmBox.dataset.email || 'hello@aimsummer.com';
    const box = confirmBox.querySelector('.confirm');
    const q = new URLSearchParams(location.search);
    const ref = (q.get('ref') || '').trim(), t = (q.get('t') || '').trim();
    const set = (state, kicker, title, text, opts = {}) => {
      box.dataset.state = state;
      const badge = box.querySelector('[data-badge]');
      badge.className = `ty__badge${state === 'loading' ? ' ty__badge--wait' : state === 'ok' || state === 'already' ? '' : ' ty__badge--no'}`;
      badge.innerHTML = state === 'loading' ? '<span class="spin"></span>' : (state === 'ok' || state === 'already') ? '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>' : '!';
      box.querySelector('[data-kicker]').textContent = kicker;
      box.querySelector('[data-title]').textContent = title;
      box.querySelector('[data-text]').textContent = text;
      const refEl = box.querySelector('[data-ref]');
      refEl.hidden = !opts.reference;
      if (opts.reference) refEl.querySelector('[data-ref-value]').textContent = opts.reference;
      box.querySelector('[data-retry-wrap]').hidden = !opts.retry;
    };
    const run = async () => {
      if (!ref || !t) {
        set('invalid', "We couldn't confirm", "This link is incomplete.", `Please open the link from the email again. If it still doesn't work, reply to that email or write to ${contact} and we'll confirm by hand.`);
        return;
      }
      set('loading', 'Parent or guardian confirmation', 'One moment…', "We're checking the link from your email.");
      const { data } = await postTo(api, 'confirm-application', { ref, t }, 20000, contact);
      if (data.ok) {
        const student = data.student_first_name || 'the student', parent = data.parent_first_name || '';
        if (data.already_confirmed) {
          set('already', 'Already confirmed', `${student}'s application was already confirmed.`, 'Nothing else to do — thank you. We email our decision within 3 business days.', { reference: data.reference });
        } else {
          set('ok', 'Confirmed', `Thank you${parent ? `, ${parent}` : ''} — ${student}'s application is confirmed.`, 'We have your confirmation as parent or guardian. Nothing else to do for now: we email our decision within 3 business days, and nothing is due before registration opens in December 2026.', { reference: data.reference });
        }
        return;
      }
      if (data.error === 'network') {
        set('error', 'Connection problem', "We couldn't reach our server.", data.message, { retry: true });
        return;
      }
      set('invalid', "We couldn't confirm", data.error === 'not_found' ? "We can't find this application." : "This link doesn't work.", `${data.message || ''} If you keep seeing this, reply to the email you received or write to ${contact} — we'll confirm by hand.`.trim());
    };
    box.querySelector('[data-retry]').addEventListener('click', run);
    run();
  }

  /* ================================================================== page: apply.html — the wizard */
  const root = document.getElementById('apply');
  if (!root) return;

  /* ------------------------------------------------------------------ config & storage */
  const api = (root.dataset.api || '').replace(/\/$/, '');
  const thanksUrl = root.dataset.thanks || 'application-received.html';
  const contact = root.dataset.email || 'hello@aimsummer.com';
  const PROGRAM_START = root.dataset.programStart || '2027-06-28';
  const PROGRAM_YEAR = Number(PROGRAM_START.slice(0, 4));
  const MIN_AGE = 13, MAX_AGE = 18, CONSENT_AGE = 14;
  const CODE_TTL_MS = 10 * 60 * 1000;

  const DRAFT_KEY = 'aim.apply.draft.v1';
  const AUTH_KEY = 'aim.apply.auth.v1';
  const CODE_KEY = 'aim.apply.code.v1';

  const store = {
    get(key, session) {
      try { return JSON.parse((session ? sessionStorage : localStorage).getItem(key) || 'null'); } catch { return null; }
    },
    set(key, value, session) {
      try {
        const s = session ? sessionStorage : localStorage;
        if (value == null) s.removeItem(key); else s.setItem(key, JSON.stringify(value));
      } catch { /* private mode or full */ }
    },
  };

  /* ------------------------------------------------------------------ DOM helpers */
  const $ = (sel, el = root) => el.querySelector(sel);
  const $$ = (sel, el = root) => Array.from(el.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const say = (el, msg, kind) => { if (!el) return; el.textContent = msg || ''; el.className = `form-status${msg ? ` is-${kind}` : ''}`; };
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const trim = (s) => String(s ?? '').trim();
  const submitForm = (f) => (f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })));
  /** textContent without the hidden parts (the "you" / "your child" variants). */
  const visibleText = (el) => {
    const c = el.cloneNode(true);
    c.querySelectorAll('[hidden]').forEach((h) => h.remove());
    return c.textContent.replace(/\s+/g, ' ').trim();
  };

  const STEPS = ['start', 'email', 'student', 'parent', 'program', 'school', 'why', 'review'];
  const NAMES = { email: 'Your email', student: 'The student', parent: 'Parent / guardian', program: 'Your program', school: 'Your school', why: 'Why AIM?', review: 'Review & send' };
  const stepEl = (name) => $(`.ap__step[data-step="${name}"]`);
  const forms = Object.fromEntries(STEPS.map((s) => [s, stepEl(s)]));

  /* ------------------------------------------------------------------ the data model */
  // Everything typed in the forms, keyed by input name. Saved as-is; converted to the API shape at submit time.
  let data = {};
  let current = 'start';
  let furthest = 0;              // index of the furthest step reached (progress pips become clickable)
  let busy = false;
  let pendingAfterAuth = null;   // where to go once the email is (re)verified
  let returnTo = null;           // "Edit" from the review → come back to the review after the fix

  const FIELD_STEP = {};         // field name → step name (for server-side errors)
  for (const s of STEPS) {
    const el = forms[s];
    if (!el) continue;
    $$('[name]', el).forEach((inp) => { FIELD_STEP[inp.name] = s; });
    $$('[data-field]', el).forEach((f) => { FIELD_STEP[f.dataset.field] = s; });
  }
  FIELD_STEP.student_dob = 'student';
  FIELD_STEP.applicant_email = 'email';

  function readForm(form) {
    const out = {};
    if (!form) return out;
    for (const inp of $$('[name]', form)) {
      if (inp.name === 'aim_hp' || inp.name === 'code') continue;
      if (inp.type === 'radio') { if (inp.checked) out[inp.name] = inp.value; else if (!(inp.name in out)) out[inp.name] = ''; }
      else if (inp.type === 'checkbox') out[inp.name] = inp.checked;
      else out[inp.name] = inp.value;
    }
    return out;
  }

  function writeForm(form, values) {
    if (!form) return;
    for (const inp of $$('[name]', form)) {
      if (!(inp.name in values)) continue;
      const v = values[inp.name];
      if (inp.type === 'radio') inp.checked = inp.value === v;
      else if (inp.type === 'checkbox') inp.checked = v === true;
      else inp.value = v == null ? '' : String(v);
    }
  }

  function collect() {
    for (const s of STEPS) Object.assign(data, readForm(forms[s]));
    return data;
  }

  /** Puts a whole set of answers back into the forms (restore from this device or from the server). */
  function restoreAll(values) {
    data = { ...values };
    populateDob();
    syncCountry();                    // the province list must match the country before anything reads the form
    for (const s of STEPS) writeForm(forms[s], data);
    syncCountry();
    syncProgram();
    syncHeard();
    markAll();
    applyVoice();
    counters();
  }

  /* ------------------------------------------------------------------ autosave (device + server) */
  const savedEl = $('[data-saved]');
  let saveTimer = null, serverTimer = null, lastSavedAt = 0;
  let serverDraftOk = true;      // becomes false if the save-draft function is not deployed (404)

  function fmtTime(ts) {
    try { return new Date(ts).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
  }
  function fmtWhen(ts) {
    const d = new Date(ts), now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    try {
      return sameDay ? `today at ${d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}`
        : `on ${d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric' })} at ${d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })}`;
    } catch { return 'earlier'; }
  }

  const DEFAULT_KEYS = new Set(['filled_by', 'country', 'session_second', 'program', 'level', 'applicant_email']);
  function hasAnswers(d) {
    return Object.entries(d || {}).some(([k, v]) => !DEFAULT_KEYS.has(k) && !k.endsWith('_touched') && v !== '' && v !== false && v != null);
  }

  function saveLocal() {
    collect();
    const savedAt = Date.now();
    store.set(DRAFT_KEY, { v: 1, step: current, furthest, data, savedAt });
    lastSavedAt = savedAt;
    if (savedEl) {
      savedEl.innerHTML = hasAnswers(data) ? `<svg class="icon icon--sm" aria-hidden="true"><use href="#i-check"/></svg> Saved on this device · ${esc(fmtTime(savedAt))}` : '';
    }
  }
  const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveLocal, 250); scheduleServerSave(); };

  function scheduleServerSave() {
    clearTimeout(serverTimer);
    serverTimer = setTimeout(saveServer, 2500);
  }
  async function saveServer() {
    const auth = getAuth();
    if (!api || !auth || !serverDraftOk || !hasAnswers(data)) return;
    const { status } = await post('save-draft', { token: auth.token, draft: { step: current, data, savedAt: lastSavedAt || Date.now() } }, 8000);
    if (status === 404) serverDraftOk = false;
  }

  /* ------------------------------------------------------------------ the verified email */
  function getAuth() {
    const a = store.get(AUTH_KEY);
    if (!a || !a.token || !a.email) return null;
    if ((a.exp || 0) - 60_000 < Date.now()) return null;   // expired (2 h) — the server would refuse it anyway
    return a;
  }
  function setAuth(email, token, firstName) {
    let exp = Date.now() + 2 * 3600_000;
    try {
      const b = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      const body = JSON.parse(atob(b + '='.repeat((4 - (b.length % 4)) % 4)));
      if (body && typeof body.x === 'number') exp = body.x * 1000;
    } catch { /* keep the default */ }
    store.set(AUTH_KEY, { email, token, exp, first_name: firstName || '', at: Date.now() });
  }

  /* ------------------------------------------------------------------ API */
  const post = (path, body, timeoutMs = 25000) => postTo(api, path, body, timeoutMs, contact);

  const query = new URLSearchParams(location.search);
  const utm = (() => {
    const o = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) if (query.get(k)) o[k] = query.get(k);
    return o;
  })();

  /* ------------------------------------------------------------------ voice: "you" vs "your child" */
  function applyVoice() {
    const who = data.filled_by === 'parent' ? 'parent' : 'student';
    $$('[data-voice]').forEach((el) => { el.hidden = el.dataset.voice !== who; });
  }

  /* ------------------------------------------------------------------ errors */
  const fieldBox = (name) => $(`[data-field="${name}"]`);
  function errEl(name) {
    const explicit = $(`[data-err-for="${name}"]`);
    if (explicit) return explicit;
    const box = fieldBox(name);
    return box ? (box.querySelector(':scope > .fld__err') || box.querySelector('.fld__err')) : null;
  }
  function setError(name, message) {
    const box = fieldBox(name);
    const err = errEl(name);
    if (box) box.classList.toggle('is-invalid', Boolean(message));
    if (err) { err.textContent = message || ''; err.hidden = !message; }
    if (!box) return;
    const inputs = $$('input, select, textarea', box);
    if (message && err) {
      if (!err.id) err.id = `err-${name}`;
      inputs.forEach((i) => { i.setAttribute('aria-invalid', 'true'); i.setAttribute('aria-describedby', err.id); });
    } else {
      inputs.forEach((i) => i.removeAttribute('aria-invalid'));
    }
  }
  function clearErrors(form) {
    $$('.is-invalid', form).forEach((b) => b.classList.remove('is-invalid'));
    $$('.fld__err', form).forEach((e) => { e.hidden = true; e.textContent = ''; });
    $$('[aria-invalid]', form).forEach((i) => i.removeAttribute('aria-invalid'));
    $$('.form-status', form).forEach((s) => say(s, ''));
  }
  function focusField(name) {
    const box = fieldBox(name);
    if (!box) return;
    const input = $('input:not([type=hidden]):not([hidden]), select:not([hidden]), textarea', box);
    const target = input || box;
    if (typeof target.focus === 'function') target.focus({ preventScroll: true });
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function showErrors(form, errors) {
    const names = Object.keys(errors);
    names.forEach((n) => setError(n, errors[n]));
    if (!names.length) return false;
    say($('.form-status', form), names.length === 1 ? 'Please fix the field highlighted below.' : `Please fix the ${names.length} fields highlighted below.`, 'error');
    focusField(names[0]);
    return true;
  }

  /* ------------------------------------------------------------------ validation helpers */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const CA_POSTAL = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d$/i;
  const US_ZIP = /^\d{5}(-\d{4})?$/;

  const validName = (v) => trim(v).length >= 1 && trim(v).length <= 60 && /\p{L}/u.test(v);
  function validPhone(v, country) {
    const d = digits(v);
    if (country === 'Canada' || country === 'United States') return d.length === 10 || (d.length === 11 && d.startsWith('1'));
    return d.length >= 10 && d.length <= 15;
  }
  function dobString(d = data) {
    const { student_dob_y: y, student_dob_m: m, student_dob_d: dd } = d;
    if (!y || !m || !dd) return null;
    const iso = `${y}-${m}-${String(dd).padStart(2, '0')}`;
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;   // e.g. February 30
    return iso;
  }
  function ageOn(iso, onIso) {
    const dob = new Date(`${iso}T00:00:00Z`), on = new Date(`${onIso}T00:00:00Z`);
    let age = on.getUTCFullYear() - dob.getUTCFullYear();
    const m = on.getUTCMonth() - dob.getUTCMonth();
    if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
    return age;
  }
  const todayIso = () => new Date().toISOString().slice(0, 10);

  /* ------------------------------------------------------------------ per-step validation (plain-English messages) */
  const validators = {
    start(d) {
      const e = {};
      if (!d.filled_by) e.filled_by = 'Please tell us who is filling in the form — the student, or a parent or guardian.';
      return e;
    },
    student(d) {
      const e = {};
      if (!validName(d.student_first_name)) e.student_first_name = "Please enter the student's first name.";
      if (!validName(d.student_last_name)) e.student_last_name = "Please enter the student's last name.";
      const dob = dobString(d);
      if (!dob) e.student_dob = (d.student_dob_y && d.student_dob_m && d.student_dob_d) ? "That date doesn't exist — please check the day and the month." : 'Please choose the month, the day and the year of birth.';
      else {
        const age = ageOn(dob, PROGRAM_START);
        if (age < MIN_AGE || age > MAX_AGE) {
          const who = trim(d.student_first_name) || 'The student';
          e.student_dob = `AIM is for students aged ${MIN_AGE} to ${MAX_AGE} during the program (summer ${PROGRAM_YEAR}). ${who} would be ${age}. If you're close to the range, write to us at ${contact} — we look at every case.`;
        }
      }
      if (!d.country) e.country = 'Please choose the country.';
      const province = d.country === 'Other' ? trim(d.province_text) : trim(d.province);
      if (!province) e.province = d.country === 'Other' ? 'Please enter the province, state or region.' : (d.country === 'United States' ? 'Please choose the state.' : 'Please choose the province or territory.');
      if (!trim(d.city)) e.city = 'Please enter the city.';
      const postal = trim(d.postal_code);
      if (!postal) e.postal_code = d.country === 'United States' ? 'Please enter the ZIP code.' : 'Please enter the postal code.';
      else if (d.country === 'Canada' && !CA_POSTAL.test(postal)) e.postal_code = 'A Canadian postal code looks like H3A 0G4 — please check it.';
      else if (d.country === 'United States' && !US_ZIP.test(postal)) e.postal_code = 'A ZIP code has 5 digits (or 5+4) — please check it.';
      else if (postal.length < 2 || postal.length > 16) e.postal_code = 'Please check the postal code.';
      if (trim(d.student_email) && !EMAIL_RE.test(trim(d.student_email))) e.student_email = "The student's email doesn't look right — check it, or leave it empty.";
      if (trim(d.student_phone) && !validPhone(d.student_phone, d.country)) e.student_phone = 'Please enter a 10-digit phone number (or leave it empty).';
      return e;
    },
    parent(d) {
      const e = {};
      if (!validName(d.parent_first_name)) e.parent_first_name = "Please enter the parent or guardian's first name.";
      if (!validName(d.parent_last_name)) e.parent_last_name = "Please enter the parent or guardian's last name.";
      const pe = trim(d.parent_email).toLowerCase();
      const auth = getAuth();
      if (!EMAIL_RE.test(pe)) e.parent_email = 'Please enter a valid email address for the parent or guardian.';
      else if (trim(d.student_email) && pe === trim(d.student_email).toLowerCase()) e.parent_email = "The parent or guardian's email must be different from the student's email.";
      else if (d.filled_by === 'student' && auth && pe === auth.email) e.parent_email = "That's the email you verified for yourself — please enter your parent or guardian's own address.";
      if (!validPhone(d.parent_phone, d.country)) e.parent_phone = "Please enter the parent or guardian's phone number — 10 digits, like 514-555-0123.";
      if (!d.parent_relationship) e.parent_relationship = 'Please tell us how this person is related to the student.';
      return e;
    },
    program(d) {
      const e = {};
      if (!d.program) e.program = 'Please choose a program.';
      if (!d.level) e.level = 'Please choose a class.';
      else if (d.level !== 'beginner') {
        const y = Number(d.previous_aim_year);
        if (!(y >= 2027 && y <= 2035)) e.previous_aim_year = 'Intermediate and Advanced are for students who finished the previous AIM class — please tell us the year (2027 or later).';
      }
      if (!d.format) e.format = 'Please choose campus, online, or no preference.';
      if (!d.session_first) e.session_first = 'Please choose a first-choice session.';
      if (d.session_second && d.session_second !== 'none' && d.session_second === d.session_first) e.session_second = 'Your second choice is the same as your first — pick another session, or "No second choice".';
      if (!d.heard_about_choice) e.heard_about = 'Please tell us how you heard about AIM — it helps us a lot.';
      return e;
    },
    school(d) {
      const e = {};
      if (!trim(d.school_name)) e.school_name = 'Please enter the name of the school.';
      if (!d.school_level) e.school_level = "Please choose the student's level for 2026–27.";
      if (!trim(d.school_city)) e.school_city = "Please enter the school's city.";
      if (!trim(d.school_province)) e.school_province = "Please enter the school's province or state.";
      if (d.english_ok !== true) e.english_ok = 'Classes are taught in English — please tick the box to confirm the student is comfortable following a class in English.';
      return e;
    },
    why(d) {
      const e = {};
      if (trim(d.motivation).length > 1000) e.motivation = 'Please keep it under 1,000 characters.';
      if (trim(d.notes).length > 1000) e.notes = 'Please keep it under 1,000 characters.';
      if (d.consent_accuracy !== true) e.consent_accuracy = 'Please confirm that the information is accurate.';
      if (d.consent_privacy !== true) e.consent_privacy = 'Please confirm that you have read how we handle personal information.';
      if (d.consent_parent !== true) e.consent_parent = d.filled_by === 'parent' ? "Please confirm that you are the student's parent or guardian." : 'Please confirm that a parent or guardian knows about this application.';
      return e;
    },
  };

  function validateStep(name, quiet) {
    const form = forms[name];
    const fn = validators[name];
    if (!form || !fn) return true;
    collect();
    if (!quiet) clearErrors(form);
    const errors = fn(data);
    if (quiet) return Object.keys(errors).length === 0;
    return !showErrors(form, errors);
  }

  /* ------------------------------------------------------------------ navigation & progress */
  const progress = $('[data-progress]');
  const mobileProg = $('[data-mobile-progress]');

  function renderProgress() {
    const idx = STEPS.indexOf(current);
    $$('li', progress).forEach((li) => {
      const s = li.dataset.for;
      const i = STEPS.indexOf(s);
      const btn = $('button', li);
      li.classList.toggle('is-current', s === current);
      li.classList.toggle('is-done', i < idx);
      btn.disabled = i > furthest;
      btn.setAttribute('aria-current', s === current ? 'step' : 'false');
    });
    root.style.setProperty('--ap-progress', `${Math.round((Math.max(0, idx) / 7) * 100)}%`);
    if (mobileProg) {
      mobileProg.hidden = current === 'start';
      const n = Math.max(1, Math.min(6, idx));
      mobileProg.textContent = current === 'review' ? 'Last step · Review & send' : `Step ${n} of 6 · ${NAMES[current] || ''}`;
    }
  }

  function go(name, opts = {}) {
    if (!forms[name]) return;
    // nothing past the email until it is verified
    if (STEPS.indexOf(name) > STEPS.indexOf('email') && !getAuth()) {
      pendingAfterAuth = name;
      name = 'email';
    }
    if (resume && !resume.hidden && !opts.keepBanner) resume.hidden = true;
    current = name;
    furthest = Math.max(furthest, STEPS.indexOf(name));
    for (const s of STEPS) if (forms[s]) forms[s].hidden = s !== name;
    applyVoice();
    if (name === 'email') renderEmailStep();
    if (name === 'student') { populateDob(); syncCountry(); prefillStudent(); ageNote(); }
    if (name === 'parent') { prefillParent(); law25Note(); }
    if (name === 'program') syncProgram();
    if (name === 'school') prefillSchool();
    if (name === 'why') counters();
    if (name === 'review') renderReview();
    markAll();
    renderProgress();
    saveLocal();
    clearTimeout(serverTimer);
    saveServer();                     // a step change is a natural checkpoint for the server-side copy
    if (!opts.silent) {
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const h = $('.ap__h', forms[name]);
      setTimeout(() => { if (h) h.focus({ preventScroll: true }); }, 350);
    }
  }

  function next() {
    if (returnTo && current !== 'review') { const t = returnTo; returnTo = null; go(t); return; }
    const i = STEPS.indexOf(current);
    if (i < STEPS.length - 1) go(STEPS[i + 1]);
  }
  function back() {
    returnTo = null;
    const i = STEPS.indexOf(current);
    if (i > 0) go(STEPS[i - 1]);
  }

  for (const s of STEPS) {
    const form = forms[s];
    if (!form) continue;
    if (form.tagName === 'FORM' && s !== 'review') {
      form.addEventListener('submit', (e) => { e.preventDefault(); if (validateStep(s)) next(); });
    }
    $$('[data-back]', form).forEach((b) => b.addEventListener('click', back));
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
  }
  $$('[data-go]', progress).forEach((b) => b.addEventListener('click', () => {
    const target = b.dataset.go;
    // going back is always allowed (you may want to fix something); going forward needs a valid current step
    if (STEPS.indexOf(target) > STEPS.indexOf(current) && !validateStep(current)) return;
    returnTo = null;
    go(target);
  }));

  function onInput(e) {
    const t = e.target;
    if (!t || !t.name) return;
    collect();
    if (t.name.startsWith('student_dob')) ageNote();
    if (t.name === 'country') syncCountry();
    if (t.name === 'filled_by') applyVoice();
    if (t.name === 'level') syncProgram();
    if (t.name === 'heard_about_choice') syncHeard();
    if (t.name === 'motivation' || t.name === 'notes') counters();
    if (t.name === 'student_first_name' || t.name === 'parent_first_name') law25Note();
    // a field's error disappears as soon as it is fixed
    const box = t.closest('[data-field]');
    if (box && box.classList.contains('is-invalid')) {
      const name = box.dataset.field;
      const fn = validators[current];
      const errs = fn ? fn(data) : {};
      if (!errs[name]) setError(name, '');
    }
    scheduleSave();
  }

  /* ------------------------------------------------------------------ step: email */
  const emailForm = $('#ap-email');
  const codeForm = $('#ap-code');
  const verifiedBox = $('[data-verified]');
  const emailInput = $('#f-applicant-email');
  const codeInput = $('#ap-code-input');
  const suggestBox = $('[data-suggest]');
  const resendBtn = $('[data-resend]');
  const countdownEl = $('[data-countdown]');
  let countdownTimer = null;

  function renderEmailStep() {
    const auth = getAuth();
    const code = store.get(CODE_KEY, true);
    stopCountdown();
    if (auth) {
      emailForm.hidden = true; codeForm.hidden = true; verifiedBox.hidden = false;
      $('[data-verified-email]').textContent = auth.email;
      return;
    }
    verifiedBox.hidden = true;
    if (code && code.email && Date.now() - (code.sentAt || 0) < CODE_TTL_MS) {
      showCodeForm(code, 'Welcome back — your code is still valid.');
    } else {
      store.set(CODE_KEY, null, true);
      emailForm.hidden = false; codeForm.hidden = true;
      if (!emailInput.value && data.applicant_email) emailInput.value = data.applicant_email;
      say($('.form-status', emailForm), pendingAfterAuth ? 'Please confirm your email again to continue — your answers are kept.' : '', 'ok');
    }
  }

  function showCodeForm(state, note) {
    emailForm.hidden = true; verifiedBox.hidden = true; codeForm.hidden = false;
    $('[data-masked]', codeForm).textContent = state.masked || state.email;
    codeInput.value = '';
    say($('.form-status', codeForm), note || '', 'ok');
    startCountdown(state);
    setTimeout(() => codeInput.focus({ preventScroll: true }), 60);
  }
  function startCountdown(state) {
    stopCountdown();
    const until = (state.sentAt || Date.now()) + (state.resendIn || 60) * 1000;
    const tick = () => {
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left > 0) { resendBtn.disabled = true; countdownEl.textContent = ` (in ${left} s)`; }
      else { resendBtn.disabled = false; countdownEl.textContent = ''; stopCountdown(); }
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }
  function stopCountdown() { if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; } }

  const setBusy = (form, on, label) => {
    busy = on;
    const btn = $('button[type="submit"]', form);
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = label; btn.disabled = true; }
    else { if (btn.dataset.label) btn.innerHTML = btn.dataset.label; btn.disabled = false; }
  };

  function codePayload(email, extra) {
    return {
      email, purpose: 'apply', role: data.filled_by === 'parent' ? 'parent' : 'student',
      interest: data.format === 'campus' || data.format === 'online' ? data.format : undefined,
      consent_info: true, consent_newsletter: false, consent_text: visibleText($('.consent--main span', emailForm)),
      website: '', source_page: location.origin + location.pathname, referrer: document.referrer || undefined, ...utm, ...(extra || {}),
    };
  }

  async function requestCode(extra) {
    if (busy) return;
    collect();
    clearErrors(emailForm);
    const email = trim(emailInput.value).toLowerCase();
    const errors = {};
    if (!EMAIL_RE.test(email)) errors.applicant_email = 'Please enter a valid email address.';
    if (!$('input[name="consent_info"]', emailForm).checked) errors.consent_info = "Please tick the box so we're allowed to email you about the application.";
    if (showErrors(emailForm, errors)) return;
    suggestBox.hidden = true;
    setBusy(emailForm, true, 'Sending the code…');
    const { data: res } = await post('request-code', codePayload(email, extra));
    setBusy(emailForm, false);
    if (res.ok) {
      const state = { email: res.email || email, masked: res.masked, sentAt: Date.now(), resendIn: res.resend_in || 60 };
      store.set(CODE_KEY, state, true);
      data.applicant_email = state.email;
      showCodeForm(state);
      return;
    }
    if (res.error === 'typo_suspected' && res.suggestion) {
      $('[data-suggestion]', suggestBox).textContent = res.suggestion;
      suggestBox.hidden = false;
      $('[data-use-suggestion]', suggestBox).focus();
      return;
    }
    if (res.error === 'cooldown') {
      const state = { email, masked: email, sentAt: Date.now() - Math.max(0, 60 - (res.retry_after || 0)) * 1000, resendIn: 60 };
      store.set(CODE_KEY, state, true);
      showCodeForm(state, 'We already sent you a code a moment ago — enter it below.');
      return;
    }
    if (res.error === 'invalid_email' || res.error === 'disposable_email' || res.error === 'domain_no_mail') {
      showErrors(emailForm, { applicant_email: res.message });
      return;
    }
    say($('.form-status', emailForm), res.message || 'Something went wrong. Please try again.', 'error');
  }

  emailForm.addEventListener('submit', (e) => { e.preventDefault(); requestCode(); });
  $('[data-use-suggestion]', suggestBox).addEventListener('click', () => { emailInput.value = $('[data-suggestion]', suggestBox).textContent; requestCode(); });
  $('[data-keep-address]', suggestBox).addEventListener('click', () => requestCode({ accept_domain: true }));

  codeInput.addEventListener('input', () => {
    const d = digits(codeInput.value).slice(0, 6);
    if (codeInput.value !== d) codeInput.value = d;
    if (d.length === 6 && !busy) submitForm(codeForm);
  });

  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const state = store.get(CODE_KEY, true);
    if (!state || !state.email) { renderEmailStep(); return; }
    const code = digits(codeInput.value);
    const status = $('.form-status', codeForm);
    if (code.length !== 6) { say(status, 'The code has 6 digits — check the email we sent you.', 'error'); codeInput.focus(); return; }
    say(status, '');
    setBusy(codeForm, true, 'Checking…');
    const { data: res } = await post('verify-code', { email: state.email, code, purpose: 'apply', website: '' });
    setBusy(codeForm, false);
    if (res.ok && res.token) {
      setAuth(res.email || state.email, res.token, res.first_name);
      store.set(CODE_KEY, null, true);
      data.applicant_email = res.email || state.email;
      say(status, 'Email confirmed!', 'ok');
      await maybeRestoreServerDraft(res.draft);
      const target = pendingAfterAuth && STEPS.indexOf(pendingAfterAuth) > STEPS.indexOf('email') ? pendingAfterAuth : 'student';
      pendingAfterAuth = null;
      setTimeout(() => go(target), 650);
      return;
    }
    if (res.error === 'wrong_code') { say(status, res.message, 'error'); codeInput.value = ''; codeInput.focus(); return; }
    if (res.error === 'code_expired' || res.error === 'too_many_attempts' || res.error === 'no_code') {
      say(status, `${res.message} Use "resend the code" below.`, 'error');
      stopCountdown(); resendBtn.disabled = false; countdownEl.textContent = '';
      return;
    }
    say(status, res.message || 'Something went wrong. Please try again.', 'error');
  });

  resendBtn.addEventListener('click', async () => {
    if (busy || resendBtn.disabled) return;
    const state = store.get(CODE_KEY, true);
    if (!state || !state.email) { renderEmailStep(); return; }
    const status = $('.form-status', codeForm);
    resendBtn.disabled = true;
    say(status, 'Sending a new code…', 'ok');
    const { data: res } = await post('request-code', codePayload(state.email, { accept_domain: true }));
    if (res.ok) {
      const nextState = { ...state, masked: res.masked || state.masked, sentAt: Date.now(), resendIn: res.resend_in || 60 };
      store.set(CODE_KEY, nextState, true);
      codeInput.value = '';
      say(status, `A new code is on its way to ${nextState.masked}. The previous one no longer works.`, 'ok');
      startCountdown(nextState);
      codeInput.focus();
    } else if (res.error === 'cooldown') {
      say(status, res.message, 'error');
      startCountdown({ sentAt: Date.now() - Math.max(0, 60 - (res.retry_after || 0)) * 1000, resendIn: 60 });
    } else {
      say(status, res.message || "We couldn't send a new code. Please try again in a minute.", 'error');
      resendBtn.disabled = false;
    }
  });

  $$('[data-change-email]').forEach((b) => b.addEventListener('click', () => {
    store.set(CODE_KEY, null, true);
    store.set(AUTH_KEY, null);
    emailForm.hidden = false; codeForm.hidden = true; verifiedBox.hidden = true;
    stopCountdown();
    clearErrors(emailForm);
    emailInput.focus();
    renderProgress();
  }));
  $('[data-next]', verifiedBox).addEventListener('click', () => { pendingAfterAuth = null; go('student'); });

  /* ------------------------------------------------------------------ step: student */
  function populateDob() {
    const days = $('[data-days]'), years = $('[data-years]');
    if (days.options.length <= 1) for (let d = 1; d <= 31; d++) days.add(new Option(String(d), String(d).padStart(2, '0')));
    if (years.options.length <= 1) {
      // 11 to 20 at the start of the program: two years of margin on each side, so the message can explain
      for (let y = PROGRAM_YEAR - 11; y >= PROGRAM_YEAR - 20; y--) years.add(new Option(String(y), String(y)));
    }
    writeForm(forms.student, { student_dob_m: data.student_dob_m || '', student_dob_d: data.student_dob_d || '', student_dob_y: data.student_dob_y || '' });
  }

  function ageNote() {
    const note = $('[data-age-note]');
    if (!note) return;
    const dob = dobString(data);
    const base = `AIM is for students aged ${MIN_AGE} to ${MAX_AGE} during the program (summer ${PROGRAM_YEAR}).`;
    if (!dob) { note.textContent = base; note.classList.remove('is-ok'); syncNewsletter(); return; }
    const age = ageOn(dob, PROGRAM_START), today = ageOn(dob, todayIso());
    const who = trim(data.student_first_name) || 'The student';
    if (age >= MIN_AGE && age <= MAX_AGE) {
      note.textContent = `✓ ${who} will be ${age} during the program${today < CONSENT_AGE ? ' — under 14 today, so a parent or guardian will confirm the application by email (Law 25).' : '.'}`;
      note.classList.add('is-ok');
      setError('student_dob', '');
    } else {
      note.textContent = base;
      note.classList.remove('is-ok');
    }
    syncNewsletter();
  }

  const US_STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'];
  const CA_PROVINCES = Array.from($('[data-province-select]').options).filter((o) => o.value).map((o) => o.value);

  function syncCountry() {
    const country = data.country || 'Canada';
    const sel = $('[data-province-select]'), txt = $('[data-province-text]');
    const label = $('[data-province-label]'), postalLabel = $('[data-postal-label]'), postal = $('#f-postal');
    const list = country === 'Canada' ? CA_PROVINCES : country === 'United States' ? US_STATES : null;
    if (list) {
      const keep = data.province;
      sel.innerHTML = '';
      sel.add(new Option('Choose…', ''));
      list.forEach((p) => sel.add(new Option(p, p)));
      sel.value = keep && list.includes(keep) ? keep : '';
      sel.hidden = false; txt.hidden = true; sel.required = true; txt.required = false;
      label.textContent = country === 'Canada' ? 'Province or territory' : 'State';
      postalLabel.textContent = country === 'Canada' ? 'Postal code' : 'ZIP code';
      postal.placeholder = country === 'Canada' ? 'H3A 0G4' : '10001';
    } else {
      sel.hidden = true; txt.hidden = false; sel.required = false; txt.required = true;
      label.textContent = 'Province, state or region';
      postalLabel.textContent = 'Postal code';
      postal.placeholder = '';
    }
  }

  function syncNewsletter() {
    const box = $('[data-newsletter]');
    if (!box) return;
    const dob = dobString(data);
    const parent = data.filled_by === 'parent';
    const oldEnough = dob ? ageOn(dob, todayIso()) >= CONSENT_AGE : false;
    const show = parent || oldEnough;             // Law 25: under 14, the student cannot consent to news — the parent can
    box.hidden = !show;
    if (!show) { const inp = $('input', box); if (inp.checked) { inp.checked = false; data.consent_newsletter = false; } }
  }

  const normalizePostal = (v, country) => (country === 'Canada' ? trim(v).toUpperCase().replace(/^(\w{3})[\s-]?(\w{3})$/, '$1 $2') : trim(v));
  $('#f-postal').addEventListener('blur', () => {
    const inp = $('#f-postal');
    const n = normalizePostal(inp.value, data.country || 'Canada');
    if (n !== inp.value) { inp.value = n; data.postal_code = n; scheduleSave(); }
  });

  function prefillStudent() {
    const auth = getAuth();
    const inp = $('#f-student-email');
    if (auth && data.filled_by === 'student' && !trim(inp.value) && !data.student_email_touched) { inp.value = auth.email; data.student_email = auth.email; }
  }
  $('#f-student-email').addEventListener('input', () => { data.student_email_touched = true; });

  /* ------------------------------------------------------------------ step: parent */
  function prefillParent() {
    const auth = getAuth();
    const inp = $('#f-parent-email');
    if (auth && data.filled_by === 'parent' && !trim(inp.value) && !data.parent_email_touched) { inp.value = auth.email; data.parent_email = auth.email; }
  }
  $('#f-parent-email').addEventListener('input', () => { data.parent_email_touched = true; });

  function law25Note() {
    const box = $('[data-law25]');
    if (!box) return;
    const dob = dobString(data);
    const under = dob ? ageOn(dob, todayIso()) < CONSENT_AGE : false;
    box.hidden = !under;
    if (under) {
      $('[data-student-first]', box).textContent = trim(data.student_first_name) || 'the student';
      $('[data-parent-first]', box).textContent = trim(data.parent_first_name) || 'The parent or guardian';
    }
  }

  /* ------------------------------------------------------------------ step: program */
  function syncProgram() {
    // classes that open in a later summer are shown, explained, and not selectable
    $$('[data-level-from]').forEach((lab) => {
      const from = Number(lab.dataset.levelFrom);
      const inp = $('input', lab), soon = $('.choice__soon', lab);
      const closed = from > PROGRAM_YEAR;
      inp.disabled = closed;
      lab.classList.toggle('is-disabled', closed);
      if (soon) soon.hidden = !closed;
      if (closed && inp.checked) { inp.checked = false; data.level = ''; }
    });
    if (!data.level) {
      const beginner = $('input[name="level"][value="beginner"]');
      if (beginner && !beginner.disabled) { beginner.checked = true; data.level = 'beginner'; }
    }
    if (!data.program) {
      const def = $('input[name="program"][data-default]');
      if (def) { def.checked = true; data.program = def.value; }
    }
    $('[data-prev-year]').hidden = !data.level || data.level === 'beginner';
    syncHeard();
  }
  function syncHeard() {
    const other = $('[data-heard-other]');
    if (other) other.hidden = data.heard_about_choice !== 'Other';
  }
  function markChoice(inp) {
    const lab = inp.closest('.choice, .pill');
    if (lab) lab.classList.toggle('is-checked', inp.checked);
  }
  function markAll() { $$('.choice input, .pill input').forEach(markChoice); }
  root.addEventListener('change', (e) => { if (e.target.matches('.choice input, .pill input')) $$(`input[name="${e.target.name}"]`).forEach(markChoice); });

  /* ------------------------------------------------------------------ step: school */
  function prefillSchool() {
    const inp = $('#f-school-province');
    if (!trim(inp.value)) {
      const prov = data.country === 'Other' ? trim(data.province_text) : trim(data.province);
      if (prov) { inp.value = prov; data.school_province = prov; }
    }
  }

  /* ------------------------------------------------------------------ step: why */
  function counters() {
    for (const name of ['motivation', 'notes']) {
      const el = $(`[data-count="${name}"]`);
      if (el) el.textContent = String(trim(data[name]).length).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
  }

  /* ------------------------------------------------------------------ review */
  const LABEL = {
    program: Object.fromEntries($$('input[name="program"]').map((i) => [i.value, $('.choice__t', i.closest('.choice')).textContent.trim()])),
    level: Object.fromEntries($$('input[name="level"]').map((i) => [i.value, $('.choice__t', i.closest('.choice')).textContent.trim()])),
    format: Object.fromEntries($$('input[name="format"]').map((i) => [i.value, $('.choice__t', i.closest('.choice')).textContent.replace(/\s+/g, ' ').trim()])),
    session: Object.fromEntries($$('input[name="session_first"]').map((i) => [i.value, `${$('.choice__t', i.closest('.choice')).firstChild.textContent.trim()} — ${$('.choice__d', i.closest('.choice')).textContent.trim()}`])),
    relationship: Object.fromEntries($$('input[name="parent_relationship"]').map((i) => [i.value, i.nextElementSibling.textContent.trim()])),
    schoolLevel: Object.fromEntries(Array.from($('#f-school-level').options).map((o) => [o.value, o.textContent])),
  };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function renderReview() {
    collect();
    const box = $('[data-review]');
    const auth = getAuth();
    const dob = dobString(data);
    const age = dob ? ageOn(dob, PROGRAM_START) : null;
    const dobText = dob ? `${MONTHS[Number(data.student_dob_m) - 1]} ${Number(data.student_dob_d)}, ${data.student_dob_y}${age != null ? ` (${age} during the program)` : ''}` : '—';
    const province = data.country === 'Other' ? data.province_text : data.province;
    const heard = data.heard_about_choice === 'Other' && trim(data.heard_about_other) ? `Other — ${trim(data.heard_about_other)}` : (data.heard_about_choice || '—');
    const yes = (v) => (v === true ? 'Yes' : 'No');
    const sections = [
      { step: 'email', title: 'Your email', rows: [['Verified email', auth ? auth.email : '— not verified'], ['Filled in by', data.filled_by === 'parent' ? 'A parent or guardian' : 'The student']] },
      { step: 'student', title: 'The student', rows: [
        ['Name', `${trim(data.student_first_name)} ${trim(data.student_last_name)}`.trim() || '—'],
        ['Date of birth', dobText],
        ['Address', [trim(data.city), province, normalizePostal(data.postal_code, data.country), data.country].filter(Boolean).join(', ') || '—'],
        ['Student’s email', trim(data.student_email) || '—'],
        ['Student’s phone', trim(data.student_phone) || '—'],
        ['AIM news & free lessons', yes(data.consent_newsletter)],
      ] },
      { step: 'parent', title: 'Parent or guardian', rows: [
        ['Name', `${trim(data.parent_first_name)} ${trim(data.parent_last_name)}`.trim() || '—'],
        ['Email', trim(data.parent_email) || '—'],
        ['Phone', trim(data.parent_phone) || '—'],
        ['Relationship', LABEL.relationship[data.parent_relationship] || '—'],
      ] },
      { step: 'program', title: 'Your program', rows: [
        ['Program', LABEL.program[data.program] || '—'],
        ['Class', (LABEL.level[data.level] || '—') + (data.level && data.level !== 'beginner' && data.previous_aim_year ? ` (previous class finished in ${data.previous_aim_year})` : '')],
        ['Format', LABEL.format[data.format] || '—'],
        ['First-choice session', LABEL.session[data.session_first] || '—'],
        ['Second choice', data.session_second && data.session_second !== 'none' ? (LABEL.session[data.session_second] || data.session_second) : 'No second choice'],
        ['Heard about AIM', heard],
      ] },
      { step: 'school', title: 'Your school', rows: [
        ['School', trim(data.school_name) || '—'],
        ['Level in 2026–27', LABEL.schoolLevel[data.school_level] || '—'],
        ['City', [trim(data.school_city), trim(data.school_province)].filter(Boolean).join(', ') || '—'],
        ['Comfortable in English', yes(data.english_ok)],
      ] },
      { step: 'why', title: 'Why AIM?', rows: [
        ['Motivation', trim(data.motivation) || 'Left empty (optional)'],
        ['Anything else', trim(data.notes) || '—'],
        ['Confirmed', [data.consent_accuracy && 'accurate information', data.consent_privacy && 'privacy terms read', data.consent_parent && (data.filled_by === 'parent' ? 'parent or guardian consent' : 'parent or guardian informed')].filter(Boolean).join(' · ') || '—'],
      ] },
    ];
    box.innerHTML = sections.map((s) => `
      <section class="review__sec">
        <header class="review__head"><h4>${esc(s.title)}</h4><button type="button" class="linkbtn" data-edit="${s.step}">Edit</button></header>
        <dl class="review__dl">${s.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      </section>`).join('');
    $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => { returnTo = 'review'; go(b.dataset.edit); }));
  }

  /* ------------------------------------------------------------------ submit */
  function buildApplication() {
    collect();
    const dob = dobString(data);
    const heard = data.heard_about_choice === 'Other' && trim(data.heard_about_other) ? `Other — ${trim(data.heard_about_other)}` : (data.heard_about_choice || '');
    const consentText = $$('.ap__consents .consent--main', forms.why).map(visibleText).join(' | ');
    return {
      filled_by: data.filled_by,
      student_first_name: trim(data.student_first_name), student_last_name: trim(data.student_last_name), student_dob: dob,
      student_email: trim(data.student_email) || undefined, student_phone: trim(data.student_phone) || undefined,
      country: data.country, province: data.country === 'Other' ? trim(data.province_text) : data.province, city: trim(data.city),
      postal_code: normalizePostal(data.postal_code, data.country),
      parent_first_name: trim(data.parent_first_name), parent_last_name: trim(data.parent_last_name), parent_email: trim(data.parent_email).toLowerCase(),
      parent_phone: trim(data.parent_phone), parent_relationship: data.parent_relationship,
      program: data.program, level: data.level, previous_aim_year: data.level !== 'beginner' && data.previous_aim_year ? Number(data.previous_aim_year) : undefined,
      format: data.format, session_first: data.session_first, session_second: data.session_second || 'none', heard_about: heard || undefined,
      school_name: trim(data.school_name), school_level: data.school_level, school_city: trim(data.school_city), school_province: trim(data.school_province), english_ok: data.english_ok === true,
      motivation: trim(data.motivation) || undefined, notes: trim(data.notes) || undefined,
      consent_accuracy: data.consent_accuracy === true, consent_privacy: data.consent_privacy === true, consent_parent: data.consent_parent === true, consent_newsletter: data.consent_newsletter === true,
      consent_text: consentText,
      source_page: location.origin + location.pathname, referrer: document.referrer || undefined, ...utm,
    };
  }

  forms.review.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const status = $('.form-status', forms.review);
    // every step must be valid — otherwise go there and show what is missing
    for (const s of ['start', 'student', 'parent', 'program', 'school', 'why']) {
      if (!validateStep(s, true)) { returnTo = 'review'; go(s); validateStep(s); return; }
    }
    const auth = getAuth();
    if (!auth) { pendingAfterAuth = 'review'; go('email'); return; }
    say(status, '');
    setBusy(forms.review, true, 'Sending your application…');
    const { data: res } = await post('submit-application', { token: auth.token, application: buildApplication(), website: $('input[name="aim_hp"]', forms.review).checked ? 'trap' : '' }, 40000);
    setBusy(forms.review, false);
    if (res.ok && res.reference) {
      store.set(RESULT_KEY, {
        reference: res.reference, student_first_name: res.student_first_name || trim(data.student_first_name), filled_by: data.filled_by,
        applicant_email: auth.email, parent_email: trim(data.parent_email).toLowerCase(), student_email: trim(data.student_email).toLowerCase() || '',
        parent_email_sent: Boolean(res.parent_email_sent), student_copy_sent: Boolean(res.student_copy_sent), parent_consent_required: Boolean(res.parent_consent_required),
        program: data.program, level: data.level, format: data.format, session_first: data.session_first, at: Date.now(),
      }, true);
      store.set(DRAFT_KEY, null);
      store.set(AUTH_KEY, null);
      say(status, 'Sent! Taking you to your confirmation…', 'ok');
      location.href = thanksUrl;
      return;
    }
    if (res.error === 'token_invalid') {
      store.set(AUTH_KEY, null);
      pendingAfterAuth = 'review';
      go('email');
      say($('.form-status', emailForm), 'Your email verification has expired (it lasts 2 hours). Please confirm your email again — your answers are kept.', 'error');
      return;
    }
    if ((res.error === 'invalid_field' || res.error === 'age_out_of_range') && res.field) {
      const step = FIELD_STEP[res.field] || 'student';
      returnTo = 'review';
      go(step);
      showErrors(forms[step], { [res.field]: res.message });
      return;
    }
    say(status, res.message || `Something went wrong. Please try again in a minute — your answers are saved. If it keeps failing, email us at ${contact}.`, 'error');
  });

  /* ------------------------------------------------------------------ the banner: resume on this device / from the server */
  const resume = $('[data-resume]');
  const resumeText = $('[data-resume-text]', resume);
  const resumeYes = $('[data-resume-continue]', resume);
  const resumeNo = $('[data-resume-reset]', resume);
  function banner(text, yesLabel, noLabel) {
    return new Promise((resolve) => {
      resumeText.textContent = text;
      resumeYes.textContent = yesLabel;
      resumeNo.textContent = noLabel;
      resume.hidden = false;
      const done = (v) => { resume.hidden = true; resumeYes.onclick = null; resumeNo.onclick = null; resolve(v); };
      resumeYes.onclick = () => done(true);
      resumeNo.onclick = () => done(false);
    });
  }

  async function offerResume(draft) {
    const useIt = await banner(`Your answers from ${fmtWhen(draft.savedAt)} are saved on this device.`, 'Continue where I left off', 'Start a new application');
    if (useIt) {
      restoreAll(draft.data);
      furthest = Math.max(1, Number(draft.furthest) || STEPS.indexOf(draft.step) || 1);
      const target = STEPS.includes(draft.step) && draft.step !== 'start' ? draft.step : 'email';
      go(target);
      return;
    }
    const erase = await banner('Erase the saved answers and start again? This cannot be undone.', 'Yes, erase them', 'No, keep them');
    if (erase) {
      store.set(DRAFT_KEY, null);
      data = {};
      for (const s of STEPS) if (forms[s] && forms[s].tagName === 'FORM') forms[s].reset();
      furthest = 0;
      syncProgram();
      markAll();
      if (savedEl) savedEl.textContent = '';
      go('start', { silent: true });
    } else {
      offerResume(draft);
    }
  }

  async function maybeRestoreServerDraft(draft) {
    if (!draft || !draft.data || typeof draft.data !== 'object' || !hasAnswers(draft.data)) return;
    const local = store.get(DRAFT_KEY);
    const localHas = local && hasAnswers(local.data);
    if (localHas && (local.savedAt || 0) >= (draft.savedAt || 0)) return;   // what is on this device is at least as recent
    const useIt = await banner(
      `We found an application you started ${fmtWhen(draft.savedAt || Date.now())}${localHas ? ' — more recent than the answers on this device' : ', on another device'}.`,
      'Use those answers', localHas ? 'Keep the answers on this device' : 'Start fresh',
    );
    if (!useIt) return;
    restoreAll(draft.data);
    furthest = Math.max(furthest, STEPS.indexOf(draft.step || 'student'));
    if (STEPS.includes(draft.step) && draft.step !== 'email' && draft.step !== 'start') pendingAfterAuth = draft.step;
    saveLocal();
  }

  /* ------------------------------------------------------------------ boot */
  function boot() {
    populateDob();
    // deep links from the site's buttons: apply.html?format=campus|online · ?program=…
    const f = query.get('format'), p = query.get('program');
    const seed = {};
    if (f && $(`input[name="format"][value="${f}"]`)) seed.format = f;
    if (p && $(`input[name="program"][value="${p}"]`)) seed.program = p;

    const draft = store.get(DRAFT_KEY);
    if (draft && draft.v === 1 && draft.data && hasAnswers(draft.data)) {
      if (seed.format && !draft.data.format) draft.data.format = seed.format;
      if (seed.program && !draft.data.program) draft.data.program = seed.program;
      writeForm(forms.program, { format: draft.data.format || '', program: draft.data.program || '' });
      offerResume(draft);
    } else {
      if (draft) store.set(DRAFT_KEY, null);
      writeForm(forms.program, seed);
    }
    collect();
    applyVoice();
    syncCountry();
    syncProgram();
    markAll();
    renderProgress();
    if (query.get('resume') === '1' || location.hash === '#apply') {
      setTimeout(() => root.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }
  boot();
})();
