import { describe, expect, it } from 'vitest';
import { diffName, normalizeHtml, pageLinks, shouldCrawl } from '../../scripts/parity/lib';

describe('parity helpers', () => {
  it('normalizes origins, bundle hashes and CSP hashes only', () => {
    const html = `<a href="http://127.0.0.1:8792/tapes"><script src="/_astro/page.BL4-qfe2.js"></script><link href="/_astro/index.DtH0aB9c.css"><meta content="script-src 'sha256-abc+/=' 'self'">`;
    expect(normalizeHtml(html, ['http://127.0.0.1:8792'])).toBe(`<a href="ORIGIN/tapes"><script src="/_astro/page.HASH.js"></script><link href="/_astro/index.HASH.css"><meta content="script-src 'sha256-X' 'self'">`);
  });

  it('ignores Astro island uids, which follow bundle chunk ids', () => {
    expect(normalizeHtml('<astro-island uid="Z1FdYL6" prefix="r1">', [])).toBe('<astro-island uid="X" prefix="r1">');
    expect(diffName('guest', '/tapes/ก', 7)).toBe('0007-guest_tapes_');
  });

  it('collects decoded same-site links without fragments', () => {
    expect(pageLinks('<a href="/tapes?cursor=a&amp;sort=new#top">x</a><a href="https://x.test/">y</a><a href="/tapes?cursor=a&amp;sort=new">z</a>')).toEqual(['/tapes?cursor=a&sort=new']);
  });

  it('skips random, API, auth and assets; admin pages only for the admin viewer', () => {
    expect(shouldCrawl('/random', 'guest')).toBe(false);
    expect(shouldCrawl('/api/auth/get-session', 'admin')).toBe(false);
    expect(shouldCrawl('/admin/tapes', 'member')).toBe(false);
    expect(shouldCrawl('/admin/tapes', 'admin')).toBe(true);
    expect(shouldCrawl('/tapes/abc', 'guest')).toBe(true);
  });
});
