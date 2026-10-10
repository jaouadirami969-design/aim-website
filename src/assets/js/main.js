/* AIM website — shared behaviour (no dependencies).
   1. mobile menu + "Learn for free" dropdown
   2. video modal (YouTube embed, or a "coming soon" message when no video ID is set yet)
   3. sign-up form: posts to the endpoint in site.json, or opens the visitor's email app as a fallback
*/
(() => {
  'use strict';

  /* ---------- 1. navigation ---------- */
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }
  document.querySelectorAll('.has-menu').forEach((item) => {
    const button = item.querySelector('button');
    const close = () => { item.classList.remove('is-open'); button.setAttribute('aria-expanded', 'false'); };
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = item.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => { if (!item.contains(e.target)) close(); });
    item.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); button.focus(); } });
  });

  /* ---------- 2. video modal ---------- */
  const modal = document.getElementById('video-modal');
  const frame = document.getElementById('video-modal-frame');
  const soon = document.getElementById('video-modal-soon');
  const title = document.getElementById('video-modal-title');
  let lastFocus = null;

  const closeModal = () => {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    frame.innerHTML = '';
    document.body.classList.remove('modal-open');
    if (lastFocus) lastFocus.focus();
  };
  const openModal = (videoId, label) => {
    if (!modal) return;
    lastFocus = document.activeElement;
    title.textContent = label || 'Video';
    if (videoId) {
      soon.hidden = true;
      frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0" title="${label || 'Video'}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    } else {
      frame.innerHTML = '';
      soon.hidden = false;
    }
    modal.hidden = false;
    document.body.classList.add('modal-open');
    modal.querySelector('.modal__close').focus();
  };
  document.querySelectorAll('[data-video]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(el.getAttribute('data-video'), el.getAttribute('data-video-title'));
    });
  });
  if (modal) {
    modal.querySelectorAll('[data-modal-close]').forEach((el) => el.addEventListener('click', closeModal));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  }

  /* ---------- 3. sign-up form ---------- */
  const form = document.getElementById('signup-form');
  if (form) {
    const status = form.querySelector('.form-status');
    const endpoint = form.dataset.endpoint;
    const email = form.dataset.email;
    const say = (msg, kind) => { status.textContent = msg; status.className = `form-status is-${kind}`; };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      form.classList.add('is-validated');
      if (!form.checkValidity()) {
        form.reportValidity();
        say('Please fill in the fields marked as required (first name, last name, email, your category and the consent box).', 'error');
        return;
      }
      if (form.querySelector('.hp').value) return; // honeypot — ignore bots silently

      const data = new FormData(form);
      const button = form.querySelector('button[type="submit"]');
      const first = data.get('first_name');

      if (endpoint) {
        button.disabled = true;
        say('Sending…', 'ok');
        try {
          const res = await fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          form.reset();
          say(`Thanks, ${first}! We received your request and will reply within two business days.`, 'ok');
        } catch (err) {
          say(`We couldn't send the form (${err.message}). Please email us directly at ${email} — or try again in a minute.`, 'error');
        } finally {
          button.disabled = false;
        }
        return;
      }

      // No endpoint configured yet: open the visitor's email app with everything pre-filled.
      const lines = [];
      for (const [key, value] of data.entries()) {
        if (key.startsWith('_') || key === 'consent' || !String(value).trim()) continue;
        lines.push(`${key.replace(/_/g, ' ')}: ${value}`);
      }
      const subject = encodeURIComponent(data.get('_subject') || 'New sign-up');
      const body = encodeURIComponent(lines.join('\n'));
      window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
      say(`Thanks, ${first}! Your email app is opening with your request — just press Send. If nothing opens, email us at ${email}.`, 'ok');
    });
  }

  /* ---------- 4. hero counter (one orchestrated moment) ---------- */
  const counter = document.querySelector('[data-count]');
  if (counter && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const target = Number(counter.dataset.count);
    const prefix = counter.dataset.prefix || '';
    const duration = 1800;
    const start = performance.now() + 250;
    const fmt = (n) => prefix + Math.round(n).toLocaleString('en-CA');
    const tick = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      counter.textContent = fmt(target * eased);
      if (t < 1) requestAnimationFrame(tick); else counter.textContent = fmt(target);
    };
    counter.textContent = fmt(0);
    requestAnimationFrame(tick);
  }
})();
