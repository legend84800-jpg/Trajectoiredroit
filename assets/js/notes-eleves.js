'use strict';

document.querySelectorAll('[data-notes-reader]').forEach(link => {
  const reader = document.getElementById(link.dataset.notesReader);
  if (!reader || typeof reader.showModal !== 'function') return;

  link.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
        event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    reader.showModal();
  });

  reader.addEventListener('close', () => link.focus({preventScroll: true}));
});
