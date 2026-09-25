const openButton = document.querySelector<HTMLButtonElement>('[data-mobile-nav-open]');
const dialog = document.querySelector<HTMLDialogElement>('#mobile-nav-dialog');
const closeButton = dialog?.querySelector<HTMLButtonElement>('[data-mobile-nav-close]');

if (openButton && dialog && typeof dialog.showModal === 'function') {
  openButton.hidden = false;
  document.documentElement.classList.add('js-nav-ready');

  openButton.addEventListener('click', () => {
    dialog.showModal();
    openButton.setAttribute('aria-expanded', 'true');
    closeButton?.focus();
  });
  const close = () => dialog.close();
  closeButton?.addEventListener('click', close);
  dialog.addEventListener('click', event => {
    if (event.target === dialog || (event.target instanceof Element && event.target.closest('a'))) close();
  });
  dialog.addEventListener('close', () => {
    openButton.setAttribute('aria-expanded', 'false');
    openButton.focus();
  });
}
