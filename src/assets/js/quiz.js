/* Mini-quiz for the free lessons.
   The questions live in the page as <script type="application/json" data-quiz> … </script>
   and are rendered here so the lesson text stays easy to edit. */
(() => {
  'use strict';
  const container = document.querySelector('[data-quiz-root]');
  const source = document.querySelector('script[data-quiz]');
  if (!container || !source) return;

  let questions;
  try { questions = JSON.parse(source.textContent); } catch { return; }

  const form = document.createElement('form');
  form.noValidate = true;
  questions.forEach((q, qi) => {
    const fs = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = `${qi + 1}. ${q.q}`;
    fs.appendChild(legend);
    const opts = document.createElement('div');
    opts.className = 'quiz__opts';
    q.options.forEach((text, oi) => {
      const label = document.createElement('label');
      label.className = 'quiz__opt';
      const input = document.createElement('input');
      input.type = 'radio'; input.name = `q${qi}`; input.value = String(oi);
      label.append(input, document.createTextNode(' ' + text));
      opts.appendChild(label);
    });
    const why = document.createElement('div');
    why.className = 'quiz__why';
    fs.append(opts, why);
    form.appendChild(fs);
  });

  const actions = document.createElement('div');
  actions.className = 'quiz__actions';
  const check = document.createElement('button');
  check.type = 'submit'; check.className = 'btn btn--primary'; check.textContent = 'Check my answers';
  const retry = document.createElement('button');
  retry.type = 'button'; retry.className = 'btn btn--ghost'; retry.textContent = 'Try again'; retry.hidden = true;
  const result = document.createElement('p');
  result.className = 'quiz__result'; result.setAttribute('role', 'status'); result.setAttribute('aria-live', 'polite');
  actions.append(check, retry);
  form.append(actions, result);
  container.appendChild(form);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let score = 0; let answered = 0;
    questions.forEach((q, qi) => {
      const chosen = form.querySelector(`input[name="q${qi}"]:checked`);
      const fs = form.children[qi];
      const why = fs.querySelector('.quiz__why');
      fs.querySelectorAll('.quiz__opt').forEach((o) => o.classList.remove('is-right', 'is-wrong'));
      if (!chosen) { why.textContent = ''; return; }
      answered++;
      const labels = fs.querySelectorAll('.quiz__opt');
      const picked = Number(chosen.value);
      labels[q.answer].classList.add('is-right');
      if (picked === q.answer) { score++; why.textContent = `✓ Right. ${q.why}`; }
      else { labels[picked].classList.add('is-wrong'); why.textContent = `Not quite. ${q.why}`; }
    });
    if (answered < questions.length) {
      result.textContent = `Answer all ${questions.length} questions to see your score (${answered} of ${questions.length} answered).`;
      return;
    }
    const total = questions.length;
    const praise = score === total ? 'Perfect — you own this lesson.' : score >= total - 1 ? 'Great work.' : score >= Math.ceil(total / 2) ? 'Good start — re-read the parts marked above.' : 'No stress: watch the video again and give it another go.';
    result.textContent = `You scored ${score} / ${total}. ${praise}`;
    retry.hidden = false;
    result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  retry.addEventListener('click', () => {
    form.reset();
    form.querySelectorAll('.quiz__opt').forEach((o) => o.classList.remove('is-right', 'is-wrong'));
    form.querySelectorAll('.quiz__why').forEach((w) => { w.textContent = ''; });
    result.textContent = '';
    retry.hidden = true;
  });
})();
