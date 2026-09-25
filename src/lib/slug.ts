import { normalizeThai } from './thai';

export const SLUG_RE = /^[a-z0-9ก-๛]+(-[a-z0-9ก-๛]+)*$/u;
export const SLUG_MAX = 80;

function sanitizeSlug(value: string): string {
  return normalizeThai(value)
    .replace(/[^a-z0-9ก-๛]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '');
}

const thaiWords = new Intl.Segmenter('th', { granularity: 'word' });

function atWordBoundary(value: string, maxCodepoints: number): string {
  const codepoints = [...value];
  if (codepoints.length <= maxCodepoints) return value;

  let length = 0;
  let lastWordEnd = 0;
  for (const word of thaiWords.segment(value)) {
    length += [...word.segment].length;
    if (length > maxCodepoints) break;
    if (word.isWordLike) lastWordEnd = length;
  }

  return codepoints.slice(0, lastWordEnd || maxCodepoints).join('').replace(/-$/u, '');
}

export function slugify(title: string): string {
  return atWordBoundary(sanitizeSlug(title), 50);
}

export function slugCandidates(
  base: string,
  opts: { year?: number | null; qualifierSlug?: string | null } = {},
): string[] {
  const baseSlug = slugify(base);
  if (!baseSlug) return [];

  const yearText = opts.year != null && Number.isInteger(opts.year) && opts.year > 0 && opts.year <= 9999
    ? `-${opts.year}` : '';
  const first = baseSlug + yearText;
  const qualifier = opts.qualifierSlug ? sanitizeSlug(opts.qualifierSlug) : '';
  const qualifierRoom = 76 - [...first].length - 1;
  const shortenedQualifier = qualifier && qualifierRoom > 0
    ? atWordBoundary(qualifier, qualifierRoom) : '';
  const qualified = shortenedQualifier ? `${first}-${shortenedQualifier}` : '';
  const retryBase = qualified || first;

  return [
    first,
    ...(qualified ? [qualified] : []),
    ...[2, 3, 4, 5].map((number) => `${retryBase}-${number}`),
  ];
}

export function decodePathSegments(pathname: string): string[] | null {
  try {
    return pathname.split('/').filter(Boolean).map((segment) =>
      decodeURIComponent(segment).normalize('NFC'),
    );
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
}

export function normalizePath(pathname: string): string | null {
  const segments = decodePathSegments(pathname);
  return segments === null ? null : `/${segments.join('/')}`;
}
