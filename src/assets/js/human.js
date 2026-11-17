/* AIM — "Are you a human?" check (Cloudflare Turnstile) for the forms that send an email (Learn more, Apply).
   The widget is invisible for most visitors (appearance: interaction-only) and only asks for a click when
   Cloudflare is unsure. learn-more.js and apply.js call window.aimHuman.token() right before request-code;
   the Edge Function checks the token with Cloudflare. No site key in site.json → token() returns '' and the
   forms work exactly as before. */
(() => {
  const meta = document.querySelector('meta[name="aim-turnstile"]');
  const siteKey = meta ? meta.content.trim() : '';
  const box = document.querySelector('[data-human]');
  let widgetId = null;
  let waiters = [];

  const settle = (token) => {
    const list = waiters;
    waiters = [];
    list.forEach((resolve) => resolve(token || ''));
  };

  // Called by Cloudflare's script once it has loaded (…/api.js?onload=aimHumanReady&render=explicit).
  window.aimHumanReady = () => {
    if (!siteKey || !box || !window.turnstile) return;
    widgetId = window.turnstile.render(box, {
      sitekey: siteKey,
      action: 'request-code',
      execution: 'execute',
      appearance: 'interaction-only',
      theme: 'light',
      callback: (token) => settle(token),
      'error-callback': () => settle(''),
      'timeout-callback': () => settle(''),
    });
  };

  window.aimHuman = {
    /** A fresh single-use token, or '' when the check is not configured or could not run. */
    async token() {
      if (!siteKey || !box) return '';
      for (let i = 0; i < 40 && widgetId === null; i++) await new Promise((r) => setTimeout(r, 200));
      if (widgetId === null) return '';
      return new Promise((resolve) => {
        const timer = setTimeout(() => settle(''), 90000);   // a visitor who never clicks: give up after 90 s
        waiters.push((token) => { clearTimeout(timer); resolve(token); });
        try {
          window.turnstile.reset(widgetId);
          window.turnstile.execute(widgetId);
        } catch {
          settle('');
        }
      });
    },
  };
})();
