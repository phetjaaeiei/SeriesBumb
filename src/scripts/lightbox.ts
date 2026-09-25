import { animate } from 'motion';

for (const gallery of document.querySelectorAll<HTMLElement>('[data-lightbox-gallery]')) {
  const links = [...gallery.querySelectorAll<HTMLAnchorElement>('[data-lightbox-open]')];
  const dialog = gallery.querySelector<HTMLDialogElement>('[data-lightbox]');
  const image = dialog?.querySelector<HTMLImageElement>('[data-lightbox-image]');
  const count = dialog?.querySelector<HTMLElement>('[data-lightbox-count]');
  const previous = dialog?.querySelector<HTMLButtonElement>('[data-lightbox-prev]');
  const next = dialog?.querySelector<HTMLButtonElement>('[data-lightbox-next]');
  const close = dialog?.querySelector<HTMLButtonElement>('[data-lightbox-close]');
  const frame = dialog?.querySelector<HTMLElement>('.tape-lightbox-frame');
  if (!links.length || !dialog || !image || !count || !previous || !next || !close || !frame) continue;

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active = 0;
  let trigger: HTMLAnchorElement | null = null;
  let touchStartX: number | null = null;

  function show(index: number, direction = 0) {
    active = (index + links.length) % links.length;
    const link = links[active];
    image!.src = link.href;
    image!.alt = link.querySelector('img')?.alt || link.getAttribute('aria-label') || '';
    count!.textContent = `${active + 1} / ${links.length}`;
    previous!.disabled = next!.disabled = links.length < 2;
    if (dialog!.open && direction && !reducedMotion()) {
      animate(image!, { opacity: [0, 1], x: [direction * 12, 0] }, { duration: .18, ease: 'easeOut' });
    }
  }

  links.forEach((link, index) => link.addEventListener('click', event => {
    event.preventDefault();
    trigger = link;
    show(index);
    dialog.showModal();
    if (!reducedMotion()) animate(frame, { opacity: [0, 1], scale: [.96, 1] }, { duration: .2, ease: 'easeOut' });
    close.focus();
  }));
  previous.addEventListener('click', () => show(active - 1, -1));
  next.addEventListener('click', () => show(active + 1, 1));
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => trigger?.focus());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(active - 1, -1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(active + 1, 1); }
  });
  image.addEventListener('touchstart', event => { touchStartX = event.changedTouches[0]?.screenX ?? null; }, { passive: true });
  image.addEventListener('touchend', event => {
    if (touchStartX === null) return;
    const delta = (event.changedTouches[0]?.screenX ?? touchStartX) - touchStartX;
    if (Math.abs(delta) >= 50) show(active + (delta < 0 ? 1 : -1), delta < 0 ? 1 : -1);
    touchStartX = null;
  }, { passive: true });
}
