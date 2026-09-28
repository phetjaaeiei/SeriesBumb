export type CatalogSort = 'new' | 'year' | 'title';
export type CursorKey = string | number;

export function encodeCursor(sort: CatalogSort, key: CursorKey, id: string): string {
  const bytes = new TextEncoder().encode(JSON.stringify([sort, key, id]));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

export function decodeCursor(sort: CatalogSort, value: string | null | undefined): { key: CursorKey; id: string } | null {
  if (!value || !/^[A-Za-z0-9_-]{1,512}$/u.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/'));
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const decoded: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!Array.isArray(decoded) || decoded.length !== 3) return null;
    const [encodedSort, key, id] = decoded;
    if (encodedSort !== sort || typeof id !== 'string' || !id || id.length > 200) return null;
    if (sort === 'title') return typeof key === 'string' && key.length <= 500 ? { key, id } : null;
    return typeof key === 'number' && Number.isSafeInteger(key) ? { key, id } : null;
  } catch {
    return null;
  }
}
