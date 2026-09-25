import { animate } from 'motion';

for (const nav of document.querySelectorAll<HTMLElement>('[data-load-more]')) {
  const link = nav.querySelector<HTMLAnchorElement>('a[data-partial-url]');
  const results = nav.closest<HTMLElement>('[data-tape-results]');
  const currentList = results?.querySelector<HTMLElement>('[data-tape-items]');
  const target = currentList?.matches('ul') ? currentList : currentList?.querySelector('tbody');
  if (!link || !target) continue;

  let busy = false;
  link.addEventListener('click', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    link.textContent = 'กำลังโหลด…';
    link.setAttribute('aria-disabled', 'true');
    results?.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch(link.dataset.partialUrl!, { headers: { Accept: 'text/html' }, credentials: 'same-origin' });
      if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html')) throw new Error('โหลดรายการไม่สำเร็จ');
      const template = document.createElement('template');
      template.innerHTML = await response.text();
      const partial = template.content.querySelector<HTMLElement>('[data-tape-partial]');
      const incomingList = partial?.querySelector<HTMLElement>('[data-tape-items]');
      const incoming = target.matches('ul') ? incomingList : incomingList?.querySelector('tbody');
      if (!partial || !incoming || incoming.tagName !== target.tagName) throw new Error('ข้อมูลรายการไม่ถูกต้อง');

      const added = [...incoming.children] as HTMLElement[];
      for (const item of added) target.appendChild(item);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        added.forEach((item, index) => {
          animate(item, { opacity: [0, 1] }, { duration: .24, delay: Math.min(index * .025, .35), ease: 'easeOut' });
        });
      }

      const next = partial.dataset.nextCursor;
      if (!next) nav.remove();
      else {
        const pageUrl = new URL(link.href);
        pageUrl.searchParams.set('cursor', next);
        link.href = pageUrl.href;
        const partialUrl = new URL(link.dataset.partialUrl!, window.location.origin);
        partialUrl.searchParams.set('cursor', next);
        link.dataset.partialUrl = partialUrl.pathname + partialUrl.search;
        link.textContent = 'โหลดเพิ่ม →';
      }
    } catch {
      link.textContent = 'โหลดไม่สำเร็จ ลองอีกครั้ง';
    } finally {
      busy = false;
      link.removeAttribute('aria-disabled');
      results?.removeAttribute('aria-busy');
    }
  });
}
