// Pure helpers for the parity harness (unit-tested in tests/unit/parity-lib.test.ts).

/**
 * Removes differences that do not change what a visitor gets: server origins, bundle hashes, CSP
 * hashes and Astro island uids (derived from the bundle's chunk ids).
 */
export function normalizeHtml(html: string, origins: string[]): string {
  let text = html;
  for (const origin of origins) text = text.split(origin).join('ORIGIN');
  return text
    .replace(/\/_astro\/([\w.-]+?)\.[\w-]{8}\.(js|css|mjs)/gu, '/_astro/$1.HASH.$2')
    .replace(/'sha256-[A-Za-z0-9+/=]+'/gu, "'sha256-X'")
    .replace(/(<astro-island\b[^>]*?) uid="[^"]*"/gu, '$1 uid="X"');
}

/** Short, collision-free file name for a crawled path. */
export function diffName(viewer: string, path: string, index: number): string {
  return `${String(index).padStart(4, '0')}-${viewer}${path.replace(/[^\w]+/gu, '_')}`.slice(0, 100);
}

/** Same-site links found in a page, decoded from HTML attribute escaping. */
export function pageLinks(html: string): string[] {
  const links = new Set<string>();
  for (const match of html.matchAll(/href="(\/[^"#]*)(?:#[^"]*)?"/gu)) links.add(match[1].replaceAll('&amp;', '&'));
  return [...links];
}

const NEVER = [/^\/(random|artists\/random)$/u, /^\/api\//u, /^\/_actions/u, /^\/_astro\//u, /^\/admin\/api\//u, /^\/login/u, /\.(png|jpe?g|webp|svg|ico|xml|css|js|woff2?)$/u];

export function shouldCrawl(path: string, viewer: string): boolean {
  if (NEVER.some((pattern) => pattern.test(path))) return false;
  if (path.startsWith('/admin')) return viewer === 'admin';
  return true;
}
