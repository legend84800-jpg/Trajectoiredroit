(() => {
  const ranking = document.getElementById('classement-chatgpt');
  if (!ranking) return;

  const choices = [...ranking.querySelectorAll('[data-ranking-choice]')];
  const tests = [...ranking.querySelectorAll('[data-ranking-test]')];
  const captures = [...ranking.querySelectorAll('[data-ranking-capture]')];
  const group = ranking.querySelector('.chatgpt-ranking__choices');
  const dialog = ranking.querySelector('dialog');
  const heading = dialog.querySelector('strong');
  const original = dialog.querySelector('[data-ranking-original]');
  const position = dialog.querySelector('[data-ranking-position]');
  const reader = dialog.querySelector('.chatgpt-ranking__reader');
  const image = reader.querySelector('img');
  let current = 0;

  function updateReader() {
    const capture = captures[current];
    image.src = capture.href;
    image.alt = capture.querySelector('img').alt;
    heading.textContent = capture.dataset.rankingCapture;
    position.textContent = `${current + 1} / ${captures.length}`;
    original.href = capture.href;
    reader.scrollTop = 0;
  }

  function select(index) {
    current = (index + captures.length) % captures.length;
    captures.forEach((capture, i) => {
      const active = i === current;
      capture.hidden = !active;
      tests[i].hidden = !active;
      choices[i].setAttribute('aria-pressed', String(active));
    });
    if (dialog.open) updateReader();
  }

  choices.forEach((button, index) => {
    button.addEventListener('click', () => select(index));
  });

  function direction(event) {
    if (event.key === 'ArrowLeft') return -1;
    if (event.key === 'ArrowRight') return 1;
    return 0;
  }

  group.addEventListener('keydown', event => {
    const step = direction(event);
    if (!step) return;
    event.preventDefault();
    select(current + step);
    choices[current].focus();
  });

  if (typeof dialog.showModal === 'function') {
    captures.forEach(capture => {
      capture.addEventListener('click', event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        updateReader();
        dialog.showModal();
      });
    });
    dialog.querySelectorAll('[data-ranking-step]').forEach(button => {
      button.addEventListener('click', () => select(current + Number(button.dataset.rankingStep)));
    });
    dialog.addEventListener('keydown', event => {
      const step = direction(event);
      if (!step) return;
      event.preventDefault();
      select(current + step);
    });
    dialog.addEventListener('close', () => captures[current].focus({ preventScroll: true }));
  }

  select(0);
  group.hidden = false;
})();
