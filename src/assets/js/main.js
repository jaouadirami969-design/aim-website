/* AIM website — shared behaviour (no dependencies).
   1. mobile menu + "Learn for free" dropdown
   2. video modal (YouTube embed, or a "coming soon" message when no video ID is set yet)
   3. email links: a small chooser (Gmail, Outlook.com, Yahoo, the default mail app, or copy) — remembered per device
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

  /* ---------- 3. email links: open Gmail, Outlook, the default mail app — or copy the address ---------- */
  const PREF_KEY = 'aim.mailClient';
  const SUBJECT = 'Question about the AIM summer program';
  const getPref = () => { try { return localStorage.getItem(PREF_KEY); } catch { return null; } };
  const setPref = (v) => { try { if (v) localStorage.setItem(PREF_KEY, v); else localStorage.removeItem(PREF_KEY); } catch { /* private mode */ } };
  const enc = encodeURIComponent;
  const compose = {
    gmail: (to) => `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(SUBJECT)}`,
    outlook: (to) => `https://outlook.live.com/mail/0/deeplink/compose?to=${enc(to)}&subject=${enc(SUBJECT)}`,
    yahoo: (to) => `https://compose.mail.yahoo.com/?to=${enc(to)}&subject=${enc(SUBJECT)}`,
    app: (to) => `mailto:${to}?subject=${enc(SUBJECT)}`,
  };
  const CLIENTS = [
    ['gmail', 'Open in Gmail', 'opens mail.google.com in a new tab'],
    ['outlook', 'Open in Outlook.com', 'opens outlook.live.com in a new tab'],
    ['yahoo', 'Open in Yahoo Mail', 'opens mail.yahoo.com in a new tab'],
    ['app', 'My mail app', 'Apple Mail, Outlook desktop, the phone\u2019s mail app\u2026'],
    ['copy', 'Copy the address', ''],
  ];
  let pop = null;
  let popLink = null;
  let toastTimer = null;

  const toast = (msg, onChange) => {
    let el = document.getElementById('aim-toast');
    if (!el) { el = document.createElement('div'); el.id = 'aim-toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = '';
    el.append(msg);
    if (onChange) {
      el.append(' ');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'linkbtn'; b.textContent = 'Change';
      b.addEventListener('click', () => { setPref(null); hideToast(); onChange(); });
      el.append(b);
    }
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 7000);
  };
  const hideToast = () => { const el = document.getElementById('aim-toast'); if (el) el.classList.remove('is-on'); };

  const openWith = async (client, to) => {
    if (client === 'copy') {
      try { await navigator.clipboard.writeText(to); toast(`${to} copied — paste it into your email.`); }
      catch { window.prompt('Copy the address:', to); }
      return;
    }
    const url = compose[client](to);
    if (client === 'app') { window.location.href = url; return; }
    const w = window.open(url, '_blank', 'noopener');
    if (!w) window.location.href = url; // pop-up blocked → same tab
  };

  const closePop = () => { if (pop) { pop.hidden = true; if (popLink) popLink.setAttribute('aria-expanded', 'false'); } };

  const buildPop = () => {
    pop = document.createElement('div');
    pop.className = 'mailpop';
    pop.hidden = true;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'How would you like to write to us?');
    pop.innerHTML = `
      <div class="mailpop__head"><strong>Write to <span data-to></span></strong><button type="button" class="mailpop__close" aria-label="Close">\u00d7</button></div>
      <div class="mailpop__list"></div>
      <label class="mailpop__remember"><input type="checkbox" checked> Remember my choice on this device</label>`;
    const list = pop.querySelector('.mailpop__list');
    for (const [id, label, hint] of CLIENTS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mailpop__opt'; b.dataset.client = id;
      b.innerHTML = `<span>${label}</span>${hint ? `<small>${hint}</small>` : ''}`;
      list.appendChild(b);
    }
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('.mailpop__opt');
      if (b) {
        const to = pop.dataset.to;
        const remember = pop.querySelector('.mailpop__remember input').checked;
        if (remember && b.dataset.client !== 'copy') setPref(b.dataset.client);
        closePop();
        openWith(b.dataset.client, to);
      }
      if (e.target.closest('.mailpop__close')) closePop();
    });
    document.body.appendChild(pop);
    document.addEventListener('click', (e) => { if (pop && !pop.hidden && !pop.contains(e.target) && e.target !== popLink && !popLink.contains(e.target)) closePop(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
  };

  const showPop = (link, to) => {
    if (!pop) buildPop();
    popLink = link;
    pop.dataset.to = to;
    pop.querySelector('[data-to]').textContent = to;
    pop.hidden = false;
    link.setAttribute('aria-expanded', 'true');
    const r = link.getBoundingClientRect();
    const sheet = window.innerWidth < 600;
    pop.classList.toggle('mailpop--sheet', sheet);
    if (!sheet) {
      const w = pop.offsetWidth;
      const left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - w - 8));
      const below = r.bottom + window.scrollY + 8;
      const spaceBelow = window.innerHeight - r.bottom;
      pop.style.left = `${left}px`;
      pop.style.top = spaceBelow < pop.offsetHeight + 16 ? `${r.top + window.scrollY - pop.offsetHeight - 8}px` : `${below}px`;
    } else {
      pop.style.left = ''; pop.style.top = '';
    }
    pop.querySelector('.mailpop__opt').focus();
  };

  document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
    link.setAttribute('aria-haspopup', 'dialog');
    link.setAttribute('aria-expanded', 'false');
    link.addEventListener('click', (e) => {
      const to = link.getAttribute('href').replace(/^mailto:/, '').split('?')[0];
      e.preventDefault();
      const pref = getPref();
      if (pref && compose[pref]) {
        openWith(pref, to);
        toast(`Opening ${pref === 'app' ? 'your mail app' : pref === 'gmail' ? 'Gmail' : pref === 'outlook' ? 'Outlook.com' : 'Yahoo Mail'}\u2026`, () => showPop(link, to));
        return;
      }
      showPop(link, to);
    });
  });

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
