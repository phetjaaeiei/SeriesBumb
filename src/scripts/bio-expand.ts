import { animate } from 'motion';

for (const root of document.querySelectorAll<HTMLElement>('[data-expandable]')) {
  const content = root.querySelector<HTMLElement>('[data-expandable-content]');
  const toggle = root.querySelector<HTMLButtonElement>('[data-expandable-toggle]');
  if (!content || !toggle) continue;
  const full = content.textContent ?? '';
  const codepoints = [...full];
  if (codepoints.length <= 600) continue;
  const preview = `${codepoints.slice(0, 600).join('').trimEnd()}…`;
  let expanded = false;
  content.textContent = preview;
  toggle.hidden = false;

  toggle.addEventListener('click', async () => {
    if (toggle.disabled) return;
    const before = content.getBoundingClientRect().height;
    expanded = !expanded;
    content.textContent = expanded ? full : preview;
    toggle.textContent = expanded ? 'ย่อข้อความ' : 'อ่านต่อ';
    toggle.setAttribute('aria-expanded', String(expanded));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const after = content.getBoundingClientRect().height;
    content.style.height = `${before}px`;
    content.style.overflow = 'hidden';
    toggle.disabled = true;
    try {
      await animate(content, { height: [`${before}px`, `${after}px`] }, { duration: .25, ease: 'easeOut' }).finished;
    } finally {
      content.style.height = '';
      content.style.overflow = '';
      toggle.disabled = false;
    }
  });
}
