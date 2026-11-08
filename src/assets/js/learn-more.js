/* AIM website — "Learn more" flow (no dependencies).
   Step 1: email + consent → POST {api}/request-code  → a 6-digit code is emailed from hello@aimsummer.com
   Step 2: the code        → POST {api}/verify-code   → info pack + team alert are sent → thank-you.html
   State lives in sessionStorage so a reload (or the thank-you page) still knows who you are. */
(() => {
  'use strict';

  const KEY = 'aim.learnMore';
  const CODE_TTL_MS = 10 * 60 * 1000;
  const readState = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const saveState = (v) => { try { if (v) sessionStorage.setItem(KEY, JSON.stringify(v)); else sessionStorage.removeItem(KEY); } catch { /* private mode */ } };

  /* ---------- the thank-you page ---------- */
  const ty = document.querySelector('[data-thank-you]');
  if (ty) {
    const s = readState();
    const nameEl = ty.querySelector('[data-ty-name]');
    const emailEl = ty.querySelector('[data-ty-email]');
    if (s && s.email) {
      if (nameEl) nameEl.textContent = s.first_name ? `Thank you, ${s.first_name}!` : 'Thank you!';
      if (emailEl) emailEl.textContent = s.email;
    } else {
      ty.querySelectorAll('[data-ty-needs-state]').forEach((el) => { el.hidden = true; });
    }
  }

  /* ---------- the form ---------- */
  const root = document.getElementById('learn-more');
  if (!root) return;

  const api = (root.dataset.api || '').replace(/\/$/, '');
  const thanksUrl = root.dataset.thanks || 'thank-you.html';
  const contact = root.dataset.email || 'hello@aimsummer.com';
  const stepEmail = root.querySelector('#lm-step-email');
  const stepCode = root.querySelector('#lm-step-code');
  const statusEmail = stepEmail.querySelector('.form-status');
  const statusCode = stepCode.querySelector('.form-status');
  const suggestBox = stepEmail.querySelector('.lm__suggest');
  const codeInput = stepCode.querySelector('#lm-code');
  const resendBtn = stepCode.querySelector('[data-resend]');
  const countdownEl = stepCode.querySelector('[data-countdown]');
  const maskedEl = stepCode.querySelector('[data-masked]');
  let countdownTimer = null;
  let busy = false;

  const say = (el, msg, kind) => { el.textContent = msg || ''; el.className = `form-status${msg ? ` is-${kind}` : ''}`; };
  const setBusy = (form, on, label) => {
    busy = on;
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = label; btn.disabled = true; }
    else { if (btn.dataset.label) btn.innerHTML = btn.dataset.label; btn.disabled = false; }
  };

  async function post(path, body) {
    if (!api) return { status: 0, data: { ok: false, error: 'not_configured', message: `This form isn't connected yet. Please email us at ${contact}.` } };
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(`${api}/${path}`, {
        method: 'POST', mode: 'cors', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      let data = {};
      try { data = await res.json(); } catch { /* no body */ }
      if (!data || typeof data !== 'object') data = {};
      if (!('ok' in data)) data.ok = res.ok;
      if (!data.ok && !data.message) data.message = `Something went wrong (HTTP ${res.status}). Please try again, or email us at ${contact}.`;
      return { status: res.status, data };
    } catch (err) {
      const timedOut = err && err.name === 'AbortError';
      return { status: 0, data: { ok: false, error: 'network', message: timedOut ? 'The request took too long. Check your connection and try again.' : `We couldn't reach our server. Check your connection and try again — or email us at ${contact}.` } };
    } finally {
      clearTimeout(t);
    }
  }

  /* --- payload for request-code (also reused by "resend") --- */
  const utm = (() => {
    const q = new URLSearchParams(location.search);
    const o = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) if (q.get(k)) o[k] = q.get(k);
    return o;
  })();

  function payloadFromForm() {
    const fd = new FormData(stepEmail);
    const consentText = stepEmail.querySelector('.consent--main span').textContent.replace(/\s+/g, ' ').trim();
    return {
      email: String(fd.get('email') || '').trim(),
      first_name: String(fd.get('first_name') || '').trim(),
      role: fd.get('role') || undefined,
      interest: fd.get('interest') || undefined,
      consent_info: fd.get('consent_info') === 'yes',
      consent_newsletter: fd.get('consent_newsletter') === 'yes',
      consent_text: consentText,
      website: String(fd.get('website') || ''),
      source_page: location.origin + location.pathname,
      referrer: document.referrer || undefined,
      ...utm,
    };
  }

  /* --- step switching --- */
  function showEmailStep(prefill) {
    stopCountdown();
    stepCode.hidden = true;
    stepEmail.hidden = false;
    suggestBox.hidden = true;
    say(statusEmail, '');
    if (prefill && prefill.email) stepEmail.elements.email.value = prefill.email;
    if (prefill && prefill.first_name) stepEmail.elements.first_name.value = prefill.first_name;
    stepEmail.elements.email.focus();
  }

  function showCodeStep(state, note, scroll = true) {
    stepEmail.hidden = true;
    stepCode.hidden = false;
    maskedEl.textContent = state.masked || state.email;
    codeInput.value = '';
    say(statusCode, note || '', 'ok');
    startCountdown(state);
    if (scroll) { setTimeout(() => codeInput.focus(), 50); root.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
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

  /* --- step 1: ask for the code --- */
  async function requestCode(extra) {
    if (busy) return;
    const payload = { ...payloadFromForm(), ...(extra || {}) };
    if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) {
      say(statusEmail, 'Please enter a valid email address.', 'error');
      stepEmail.elements.email.focus();
      return;
    }
    if (!payload.consent_info) {
      say(statusEmail, 'Please tick the first box so we’re allowed to email you the info pack.', 'error');
      stepEmail.querySelector('input[name="consent_info"]').focus();
      return;
    }
    suggestBox.hidden = true;
    say(statusEmail, '');
    setBusy(stepEmail, true, 'Sending the code…');
    const { data } = await post('request-code', payload);
    setBusy(stepEmail, false);

    if (data.ok) {
      const state = {
        email: data.email || payload.email.toLowerCase(), masked: data.masked, first_name: payload.first_name,
        role: payload.role, interest: payload.interest, consent_newsletter: payload.consent_newsletter, consent_text: payload.consent_text,
        sentAt: Date.now(), resendIn: data.resend_in || 60,
      };
      saveState(state);
      showCodeStep(state);
      return;
    }
    if (data.error === 'typo_suspected' && data.suggestion) {
      suggestBox.querySelector('[data-suggestion]').textContent = data.suggestion;
      suggestBox.hidden = false;
      suggestBox.querySelector('[data-use-suggestion]').focus();
      return;
    }
    if (data.error === 'cooldown') {
      // A code was already sent to this address less than a minute ago (a reload, a double click): go straight to step 2.
      const state = readState() || {};
      const next = { ...state, email: payload.email.toLowerCase(), masked: state.masked || payload.email.toLowerCase(), first_name: payload.first_name, role: payload.role, interest: payload.interest, consent_newsletter: payload.consent_newsletter, consent_text: payload.consent_text, sentAt: Date.now() - Math.max(0, 60 - (data.retry_after || 0)) * 1000, resendIn: 60 };
      saveState(next);
      showCodeStep(next, 'We already sent you a code a moment ago — enter it below.');
      return;
    }
    say(statusEmail, data.message || 'Something went wrong. Please try again.', 'error');
  }

  stepEmail.addEventListener('submit', (e) => { e.preventDefault(); requestCode(); });
  suggestBox.querySelector('[data-use-suggestion]').addEventListener('click', () => {
    stepEmail.elements.email.value = suggestBox.querySelector('[data-suggestion]').textContent;
    requestCode();
  });
  suggestBox.querySelector('[data-keep-address]').addEventListener('click', () => requestCode({ accept_domain: true }));

  /* --- step 2: verify the code --- */
  codeInput.addEventListener('input', () => {
    const digits = codeInput.value.replace(/\D/g, '').slice(0, 6);
    if (codeInput.value !== digits) codeInput.value = digits;
    if (digits.length === 6 && !busy) stepCode.requestSubmit();
  });

  stepCode.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const state = readState();
    if (!state || !state.email) { showEmailStep(); return; }
    const code = codeInput.value.replace(/\D/g, '');
    if (code.length !== 6) { say(statusCode, 'The code has 6 digits — check the email we sent you.', 'error'); codeInput.focus(); return; }
    say(statusCode, '');
    setBusy(stepCode, true, 'Checking…');
    const { data } = await post('verify-code', { email: state.email, code, website: '' });
    setBusy(stepCode, false);

    if (data.ok) {
      saveState({ ...state, done: true, first_name: data.first_name || state.first_name, verifiedAt: Date.now() });
      say(statusCode, 'Verified! Sending your info pack…', 'ok');
      location.href = thanksUrl;
      return;
    }
    if (data.error === 'wrong_code') {
      say(statusCode, data.message, 'error');
      codeInput.value = '';
      codeInput.focus();
      return;
    }
    if (data.error === 'code_expired' || data.error === 'too_many_attempts' || data.error === 'no_code') {
      say(statusCode, `${data.message} Use "resend the code" below.`, 'error');
      stopCountdown();
      resendBtn.disabled = false;
      countdownEl.textContent = '';
      return;
    }
    say(statusCode, data.message || 'Something went wrong. Please try again.', 'error');
  });

  resendBtn.addEventListener('click', async () => {
    if (busy || resendBtn.disabled) return;
    const state = readState();
    if (!state || !state.email) { showEmailStep(); return; }
    resendBtn.disabled = true;
    say(statusCode, 'Sending a new code…', 'ok');
    const { data } = await post('request-code', {
      email: state.email, first_name: state.first_name, role: state.role, interest: state.interest,
      consent_info: true, consent_newsletter: !!state.consent_newsletter, consent_text: state.consent_text, accept_domain: true,
      website: '', source_page: location.origin + location.pathname, referrer: document.referrer || undefined, ...utm,
    });
    if (data.ok) {
      const next = { ...state, masked: data.masked || state.masked, sentAt: Date.now(), resendIn: data.resend_in || 60, done: false };
      saveState(next);
      codeInput.value = '';
      say(statusCode, `A new code is on its way to ${next.masked}. The previous one no longer works.`, 'ok');
      startCountdown(next);
      codeInput.focus();
    } else if (data.error === 'cooldown') {
      say(statusCode, data.message, 'error');
      startCountdown({ sentAt: Date.now() - Math.max(0, 60 - (data.retry_after || 0)) * 1000, resendIn: 60 });
    } else {
      say(statusCode, data.message || 'We couldn’t send a new code. Please try again in a minute.', 'error');
      resendBtn.disabled = false;
    }
  });

  stepCode.querySelector('[data-change-email]').addEventListener('click', () => {
    const state = readState();
    saveState(null);
    showEmailStep(state);
  });

  /* --- on load: resume step 2 if a code was sent less than 10 minutes ago --- */
  const existing = readState();
  if (existing && existing.email && !existing.done && Date.now() - (existing.sentAt || 0) < CODE_TTL_MS) {
    showCodeStep(existing, 'Welcome back — your code is still valid.', false);
  } else if (existing && existing.email && !existing.done) {
    saveState(null);
  }
})();
