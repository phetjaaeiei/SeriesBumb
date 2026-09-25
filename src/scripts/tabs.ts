import { animate } from 'motion';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

for (const root of document.querySelectorAll<HTMLElement>('[data-tabs]')) {
  const list = root.querySelector<HTMLElement>('[data-tab-list]');
  const marker = root.querySelector<HTMLElement>('[data-tab-marker]');
  const links = [...root.querySelectorAll<HTMLAnchorElement>('[data-tab-link]')];
  const panels = [...root.querySelectorAll<HTMLElement>('[data-tab-panel]')];
  if (!list || !links.length || !panels.length) continue;

  const byId = new Map(panels.map(panel => [panel.id, panel]));
  const validLinks = links.filter(link => byId.has(link.hash.slice(1)));
  if (!validLinks.length) continue;
  list.setAttribute('role', 'tablist');
  root.classList.add('tabs-enhanced');

  for (const link of validLinks) {
    const id = link.hash.slice(1);
    link.setAttribute('role', 'tab');
    link.id ||= `tab-${id}`;
    link.setAttribute('aria-controls', id);
    const panel = byId.get(id)!;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', link.id);
    panel.tabIndex = 0;
  }

  function placeMarker(link: HTMLAnchorElement, animated: boolean) {
    if (!marker || !list) return;
    marker.hidden = false;
    const x = link.offsetLeft;
    const width = link.offsetWidth;
    if (animated && !reducedMotion()) animate(marker, { x, width }, { duration: .2, ease: 'easeOut' });
    else { marker.style.transform = `translateX(${x}px)`; marker.style.width = `${width}px`; }
  }

  function select(link: HTMLAnchorElement, updateHash: boolean, animated: boolean) {
    const id = link.hash.slice(1);
    for (const item of validLinks) {
      const selected = item === link;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      const panel = byId.get(item.hash.slice(1))!;
      panel.hidden = !selected;
      if (selected && animated && !reducedMotion()) animate(panel, { opacity: [0, 1] }, { duration: .15 });
    }
    placeMarker(link, animated);
    if (updateHash) history.replaceState(null, '', `#${id}`);
  }

  for (const [index, link] of validLinks.entries()) {
    link.addEventListener('click', event => { event.preventDefault(); select(link, true, true); });
    link.addEventListener('keydown', event => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % validLinks.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + validLinks.length) % validLinks.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = validLinks.length - 1;
      else return;
      event.preventDefault();
      validLinks[next].focus();
      select(validLinks[next], true, true);
    });
  }
  const fromHash = validLinks.find(link => link.hash === window.location.hash);
  select(fromHash ?? validLinks[0], false, false);
  window.addEventListener('resize', () => {
    const active = validLinks.find(link => link.getAttribute('aria-selected') === 'true');
    if (active) placeMarker(active, false);
  });
}
