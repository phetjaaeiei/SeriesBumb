import { RELEASE_TYPES } from '../domain/enums';
import { buildSearchQuery } from '../domain/search';
import { decodeCursor, encodeCursor } from '../domain/cursor';

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

export interface AdvancedSearchItem { id: string; slug: string; title: string; sortKey: string; detail: string }

const kinds: AdvancedKind[] = ['artist', 'tape', 'song', 'label'];
const clean = (value: string | null) => (value ?? '').trim().slice(0, 100);
const year = (value: string | null) => value && /^\d{4}$/u.test(value) && Number(value) >= 1900 && Number(value) <= 2100 ? Number(value) : null;

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

export async function advancedSearch(db: D1Database, filters: AdvancedSearchFilters): Promise<{ items: AdvancedSearchItem[]; nextCursor: string | null }> {
  const { kind } = filters;
  const table = kind === 'artist' ? 'artist' : kind === 'label' ? 'label' : kind === 'tape' ? 'tape' : 'song';
  const title = kind === 'tape' || kind === 'song' ? 'title' : 'name';
  const sort = kind === 'tape' || kind === 'song' ? 'titleSort' : 'nameSort';
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  if (kind === 'tape') conditions.push("e.status = 'published'");
  if (kind === 'song') conditions.push('e.isPublic = 1');
  if (kind === 'artist') conditions.push(`EXISTS (SELECT 1 FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = e.id AND s.isPublic = 1)`);
  if (kind === 'label') conditions.push('e.publishedTapeCount > 0');

  const search = buildSearchQuery(filters.query);
  if (search.prefix) {
    if (search.fts) {
      conditions.push(`e.id IN (SELECT d.refId FROM search_fts f JOIN search_doc d ON d.docId = f.rowid WHERE search_fts MATCH ? AND d.kind = ? AND d.isPublic = 1 LIMIT 300)`);
      values.push(search.fts, kind);
    } else {
      conditions.push(`e.id IN (SELECT refId FROM search_doc WHERE isPublic = 1 AND kind = ? AND nameKey >= ? AND nameKey < ? LIMIT 300)`);
      values.push(kind, search.prefix, `${search.prefix}\uffff`);
    }
  }
  if (filters.artist) {
    if (kind === 'tape') conditions.push('EXISTS (SELECT 1 FROM tape_artist ta JOIN artist a ON a.id = ta.artistId WHERE ta.tapeId = e.id AND a.slug = ?)');
    else if (kind === 'song') conditions.push('EXISTS (SELECT 1 FROM song_artist sa JOIN artist a ON a.id = sa.artistId WHERE sa.songId = e.id AND a.slug = ?)');
    else if (kind === 'artist') conditions.push('e.slug = ?');
    else conditions.push('0 = 1');
    if (kind !== 'label') values.push(filters.artist);
  }
  if (filters.label) {
    if (kind === 'tape') conditions.push('EXISTS (SELECT 1 FROM label l WHERE l.id = e.labelId AND l.slug = ?)');
    else if (kind === 'song') conditions.push("EXISTS (SELECT 1 FROM tape_track tt JOIN tape t ON t.id = tt.tapeId JOIN label l ON l.id = t.labelId WHERE tt.songId = e.id AND t.status = 'published' AND l.slug = ?)");
    else if (kind === 'label') conditions.push('e.slug = ?');
    else conditions.push('0 = 1');
    if (kind !== 'artist') values.push(filters.label);
  }
  if (filters.genre) {
    if (kind === 'tape') conditions.push('EXISTS (SELECT 1 FROM tape_genre tg JOIN genre g ON g.id = tg.genreId WHERE tg.tapeId = e.id AND g.slug = ?)');
    else if (kind === 'song') conditions.push("EXISTS (SELECT 1 FROM tape_track tt JOIN tape t ON t.id = tt.tapeId JOIN tape_genre tg ON tg.tapeId = t.id JOIN genre g ON g.id = tg.genreId WHERE tt.songId = e.id AND t.status = 'published' AND g.slug = ?)");
    else conditions.push('0 = 1');
    if (kind === 'tape' || kind === 'song') values.push(filters.genre);
  }
  if (filters.yearFrom || filters.yearTo || filters.releaseType) {
    if (kind === 'tape') {
      if (filters.yearFrom) { conditions.push('e.year >= ?'); values.push(filters.yearFrom); }
      if (filters.yearTo) { conditions.push('e.year <= ?'); values.push(filters.yearTo); }
      if (filters.releaseType) { conditions.push('e.releaseType = ?'); values.push(filters.releaseType); }
    } else if (kind === 'song') {
      const releaseConditions = ["tt.songId = e.id", "t.status = 'published'"];
      if (filters.yearFrom) { releaseConditions.push('t.year >= ?'); values.push(filters.yearFrom); }
      if (filters.yearTo) { releaseConditions.push('t.year <= ?'); values.push(filters.yearTo); }
      if (filters.releaseType) { releaseConditions.push('t.releaseType = ?'); values.push(filters.releaseType); }
      conditions.push(`EXISTS (SELECT 1 FROM tape_track tt JOIN tape t ON t.id = tt.tapeId WHERE ${releaseConditions.join(' AND ')})`);
    } else conditions.push('0 = 1');
  }
  if (filters.province) {
    if (kind === 'artist') { conditions.push('e.province = ?'); values.push(filters.province); }
    else if (kind === 'tape') { conditions.push('EXISTS (SELECT 1 FROM tape_artist ta JOIN artist a ON a.id = ta.artistId WHERE ta.tapeId = e.id AND a.province = ?)'); values.push(filters.province); }
    else if (kind === 'song') { conditions.push('EXISTS (SELECT 1 FROM song_artist sa JOIN artist a ON a.id = sa.artistId WHERE sa.songId = e.id AND a.province = ?)'); values.push(filters.province); }
    else conditions.push('0 = 1');
  }
  const cursor = decodeCursor('title', filters.cursor);
  if (cursor) { conditions.push(`(e.${sort} > ? OR (e.${sort} = ? AND e.id > ?))`); values.push(String(cursor.key), String(cursor.key), cursor.id); }
  const rows = (await db.prepare(`SELECT e.id, e.slug, e.${title} AS title, e.${sort} AS sortKey FROM ${table} e WHERE ${conditions.join(' AND ')} ORDER BY e.${sort}, e.id LIMIT 21`).bind(...values).all<AdvancedSearchItem>()).results;
  const hasMore = rows.length > 20;
  const items = rows.slice(0, 20).map(item => ({ ...item, detail: '' }));
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? encodeCursor('title', last.sortKey, last.id) : null };
}
