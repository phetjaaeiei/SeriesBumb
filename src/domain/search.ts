import { RELEASE_TYPES } from './enums';
import { normalizeThai } from './thai';

/** Normalize one catalog field, retaining no separators inside the field. */
export function normalizeSearchField(value: string): string {
  return normalizeThai(value)
    .replace(/[\u0e47-\u0e4e]/gu, '')
    .replace(/[\p{White_Space}\p{P}\p{S}]+/gu, '');
}

export function searchDocument(parts: (string | null | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part))
    .map(normalizeSearchField).filter(Boolean).join(' | ');
}

export function buildSearchQuery(input: string): { text: string; fts: string | null; prefix: string } {
  const text = [...normalizeThai(input).trim().replace(/\s+/gu, ' ')].slice(0, 100).join('');
  const words = text.split(' ').slice(0, 5).map(normalizeSearchField).filter(Boolean);
  const ftsWords = words.filter(word => [...word].length >= 3);
  return {
    text,
    fts: ftsWords.length ? ftsWords.map(word => `"${word.replace(/"/gu, '""')}"`).join(' ') : null,
    prefix: words.join(''),
  };
}

export type AdvancedKind = 'artist' | 'tape' | 'song' | 'label';
export interface AdvancedSearchFilters {
  query: string;
  kind: AdvancedKind;
  artist: string;
  label: string;
  genre: string;
  yearFrom: number | null;
  yearTo: number | null;
  releaseType: string;
  province: string;
  cursor: string | null;
}

const kinds: AdvancedKind[] = ['artist', 'tape', 'song', 'label'];
const clean = (value: string | null) => (value ?? '').trim().slice(0, 100);
const year = (value: string | null) => value && /^\d{4}$/u.test(value) && Number(value) >= 1900 && Number(value) <= 2100 ? Number(value) : null;

/** Bounds and normalizes /search/advanced query parameters; unknown values fall back to no filter. */
export function parseAdvancedSearch(params: URLSearchParams): AdvancedSearchFilters {
  const kind = params.get('kind');
  const releaseType = params.get('releaseType');
  return {
    query: clean(params.get('q')),
    kind: kinds.includes(kind as AdvancedKind) ? kind as AdvancedKind : 'song',
    artist: clean(params.get('artist')),
    label: clean(params.get('label')),
    genre: clean(params.get('genre')),
    yearFrom: year(params.get('yearFrom')),
    yearTo: year(params.get('yearTo')),
    releaseType: RELEASE_TYPES.includes(releaseType as typeof RELEASE_TYPES[number]) ? releaseType! : '',
    province: clean(params.get('province')),
    cursor: clean(params.get('cursor')) || null,
  };
}
