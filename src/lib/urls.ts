export function safeNextPath(next: string | null | undefined, siteUrl: string): string {
  if (!next) return '/';
  try {
    const base = new URL(siteUrl);
    const candidate = new URL(next, base);
    if (candidate.origin !== base.origin
      || candidate.pathname.startsWith('/login')
      || candidate.pathname.startsWith('/api/auth/')) return '/';
    return candidate.pathname + candidate.search + candidate.hash;
  } catch {
    return '/';
  }
}

export function canonicalUrl(path: string, siteUrl: string): string {
  const origin = siteUrl.replace(/\/+$/u, '');
  const absolutePath = path.startsWith('/') ? path : `/${path}`;
  return origin + encodeURI(absolutePath.normalize('NFC'));
}

export function imageUrl(key: string, imageBaseUrl: string): string {
  const base = imageBaseUrl.replace(/\/+$/u, '');
  const cleanKey = key.replace(/^\/+|\/+$/gu, '');
  if (/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o$/u.test(base)) {
    return `${base}/${encodeURIComponent(cleanKey)}?alt=media`;
  }
  return `${base}/${cleanKey.split('/').map(encodeURIComponent).join('/')}`;
}

export function thumbKeyFromFull(fullKey: string): string {
  return fullKey.replace(/-full\.([^./]+)$/u, '-thumb.$1');
}
