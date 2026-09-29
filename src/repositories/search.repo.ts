import { jsonParam } from '../db/client';
import type { SqlClient } from '../db/sql-client';
import type { SearchKind } from '../domain/enums';
import { decodeCursor, encodeCursor } from '../domain/cursor';
import { buildSearchQuery, type AdvancedSearchFilters } from '../domain/search';

export interface SearchResult {
  kind: 'tape' | 'song' | 'artist' | 'label' | 'collection';
  slug: string;
  title: string;
}

const searchKinds: SearchResult['kind'][] = ['tape', 'song', 'artist', 'label', 'collection'];

/** Up to 20 public matches per kind for the quick search; [] for an empty query or when the index cannot be read. */
export async function searchPublic(sql: SqlClient, rawQuery: string): Promise<SearchResult[]> {
  const query = buildSearchQuery(rawQuery);
  if (!query.prefix) return [];
  let indexed: { results: { kind: SearchResult['kind']; refId: string }[] };
  try {
    indexed = query.fts
      ? await sql.prepare(`SELECT kind, refId FROM (
          SELECT d.kind, d.refId, row_number() OVER (PARTITION BY d.kind ORDER BY c.rank) AS rn
          FROM (SELECT rowid, rank FROM search_fts WHERE search_fts MATCH ? ORDER BY rank LIMIT 300) c
          JOIN search_doc d ON d.docId = c.rowid WHERE d.isPublic = 1
        ) WHERE rn <= 20`).bind(query.fts).all<{ kind: SearchResult['kind']; refId: string }>()
      : { results: (await Promise.all(searchKinds.map(kind => sql.prepare(`SELECT kind, refId FROM search_doc
          WHERE isPublic = 1 AND kind = ? AND nameKey >= ? AND nameKey < ?
          ORDER BY nameKey LIMIT 20`).bind(kind, query.prefix, `${query.prefix}\uffff`)
          .all<{ kind: SearchResult['kind']; refId: string }>())))
          .flatMap(page => page.results) };
  } catch {
    return [];
  }
  const groups = new Map<SearchResult['kind'], string[]>();
  for (const row of indexed.results) {
    const ids = groups.get(row.kind) ?? [];
    ids.push(row.refId);
    groups.set(row.kind, ids);
  }
  const result: SearchResult[] = [];
  const tables: { kind: SearchResult['kind']; table: string; title: string }[] = [
    { kind: 'tape', table: 'tape', title: 'title' },
    { kind: 'song', table: 'song', title: 'title' },
    { kind: 'artist', table: 'artist', title: 'name' },
    { kind: 'label', table: 'label', title: 'name' },
    { kind: 'collection', table: 'collection', title: 'title' },
  ];
  try {
    for (const { kind, table, title } of tables) {
      const ids = groups.get(kind);
      if (!ids?.length) continue;
      const rows = await sql.prepare(`SELECT slug, ${title} AS title FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')}) LIMIT 20`).bind(...ids).all<{ slug: string; title: string }>();
      result.push(...rows.results.map(row => ({ kind, ...row })));
    }
  } catch {
    return [];
  }
  return result;
}

export interface AdvancedSearchItem { id: string; slug: string; title: string; sortKey: string; detail: string }

/** One page (20) of public records of `filters.kind` matching every filter, by name/title, with the next page's cursor. */
export async function advancedSearch(sql: SqlClient, filters: AdvancedSearchFilters): Promise<{ items: AdvancedSearchItem[]; nextCursor: string | null }> {
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
  const rows = (await sql.prepare(`SELECT e.id, e.slug, e.${title} AS title, e.${sort} AS sortKey FROM ${table} e WHERE ${conditions.join(' AND ')} ORDER BY e.${sort}, e.id LIMIT 21`).bind(...values).all<AdvancedSearchItem>()).results;
  const hasMore = rows.length > 20;
  const items = rows.slice(0, 20).map(item => ({ ...item, detail: '' }));
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? encodeCursor('title', last.sortKey, last.id) : null };
}

/** Records waiting in the search reindex queue. */
export async function countSearchQueue(sql: SqlClient): Promise<number> {
  const row = await sql.prepare('SELECT COUNT(*) AS count FROM search_queue').first<{ count: number }>();
  return row?.count ?? 0;
}

// Index writes. Statement builders return prepared statements so the calling service keeps them in
// the same atomic batch as the record change they index.

/** Deletes the record's full-text row (its search_doc row stays). */
function deleteSearchTextStmt(sql: SqlClient, kind: SearchKind, refId: string): D1PreparedStatement {
  return sql.prepare('DELETE FROM search_fts WHERE rowid = (SELECT docId FROM search_doc WHERE kind = ? AND refId = ?)').bind(kind, refId);
}

/** Upserts the record's search_doc row and replaces its full-text row with `text`. */
export function indexSearchDocStmts(sql: SqlClient, kind: SearchKind, refId: string, isPublic: boolean, nameKey: string, text: string): D1PreparedStatement[] {
  return [
    sql.prepare(`INSERT INTO search_doc (kind, refId, isPublic, nameKey) VALUES (?, ?, ?, ?) ON CONFLICT(kind, refId) DO UPDATE SET isPublic = excluded.isPublic, nameKey = excluded.nameKey`).bind(kind, refId, Number(isPublic), nameKey),
    deleteSearchTextStmt(sql, kind, refId),
    sql.prepare('INSERT INTO search_fts (rowid, text) SELECT docId, ? FROM search_doc WHERE kind = ? AND refId = ?').bind(text, kind, refId),
  ];
}

/** Removes the record's full-text row, search_doc row and any queued reindex. */
export function removeSearchDocStmts(sql: SqlClient, kind: SearchKind, refId: string): D1PreparedStatement[] {
  return [
    deleteSearchTextStmt(sql, kind, refId),
    sql.prepare('DELETE FROM search_doc WHERE kind = ? AND refId = ?').bind(kind, refId),
    sql.prepare('DELETE FROM search_queue WHERE kind = ? AND refId = ?').bind(kind, refId),
  ];
}

/** Recomputes search visibility of these songs: public, or on a published tape. */
export function refreshSongSearchVisibilityStmt(sql: SqlClient, songIds: string[]): D1PreparedStatement {
  return sql.prepare("UPDATE search_doc SET isPublic = (SELECT CASE WHEN isPublic = 1 OR publishedTapeCount > 0 THEN 1 ELSE 0 END FROM song WHERE id = search_doc.refId) WHERE kind = 'song' AND refId IN (SELECT value FROM json_each(?))").bind(jsonParam(songIds));
}

/** Recomputes search visibility of these artists: a published tape or a public song. */
export function refreshArtistSearchVisibilityStmt(sql: SqlClient, artistIds: string[]): D1PreparedStatement {
  return sql.prepare("UPDATE search_doc SET isPublic = (SELECT CASE WHEN publishedTapeCount > 0 OR EXISTS (SELECT 1 FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = artist.id AND s.isPublic = 1) THEN 1 ELSE 0 END FROM artist WHERE id = search_doc.refId) WHERE kind = 'artist' AND refId IN (SELECT value FROM json_each(?))").bind(jsonParam(artistIds));
}

/** Recomputes search visibility of one artist: a published tape or a public song. */
export function refreshOneArtistSearchVisibilityStmt(sql: SqlClient, artistId: string): D1PreparedStatement {
  return sql.prepare("UPDATE search_doc SET isPublic = (SELECT CASE WHEN publishedTapeCount > 0 OR EXISTS (SELECT 1 FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = artist.id AND s.isPublic = 1) THEN 1 ELSE 0 END FROM artist WHERE id = ?) WHERE kind = 'artist' AND refId = ?").bind(artistId, artistId);
}

/** Recomputes search visibility of these labels: a published tape. */
export function refreshLabelSearchVisibilityStmt(sql: SqlClient, labelIds: string[]): D1PreparedStatement {
  return sql.prepare("UPDATE search_doc SET isPublic = (SELECT CASE WHEN publishedTapeCount > 0 THEN 1 ELSE 0 END FROM label WHERE id = search_doc.refId) WHERE kind = 'label' AND refId IN (SELECT value FROM json_each(?))").bind(jsonParam(labelIds));
}

/** Recomputes search visibility of one label: a published tape. */
export function refreshOneLabelSearchVisibilityStmt(sql: SqlClient, labelId: string): D1PreparedStatement {
  return sql.prepare("UPDATE search_doc SET isPublic = (SELECT CASE WHEN publishedTapeCount > 0 THEN 1 ELSE 0 END FROM label WHERE id = ?) WHERE kind = 'label' AND refId = ?").bind(labelId, labelId);
}

// Reindex queue and document sources.

export interface SearchRef { kind: SearchKind; refId: string }
export interface SearchDocumentRow extends SearchRef { nameKey: string; text: string; isPublic: number }

export interface TapeSearchSource { id: string; title: string; titleAlt: string | null; catalogNo: string | null; status: string; labelName: string | null; artistNames: string | null }
export interface SongSearchSource { id: string; title: string; titleAlt: string | null; lyricist: string | null; composer: string | null; publishedTapeCount: number; isPublic: number; singers: string | null }
export interface ArtistSearchSource { id: string; name: string; nameAlt: string | null; publishedTapeCount: number; hasPublicSong: number; members: string | null }
export interface LabelSearchSource { id: string; name: string; nameAlt: string | null; publishedTapeCount: number }
export interface CollectionSearchSource { id: string; title: string; status: string }

/** The fields a tape's search document is built from, for these tape ids. */
export async function listTapeSearchSources(sql: SqlClient, ids: string[]): Promise<TapeSearchSource[]> {
  return (await sql.prepare(`SELECT t.id, t.title, t.titleAlt, t.catalogNo, t.status, l.name AS labelName,
        (SELECT group_concat(a.name, ' | ') FROM tape_artist ta JOIN artist a ON a.id = ta.artistId WHERE ta.tapeId = t.id) AS artistNames
        FROM tape t LEFT JOIN label l ON l.id = t.labelId WHERE t.id IN (SELECT value FROM json_each(?))`).bind(jsonParam(ids)).all<TapeSearchSource>()).results;
}

/** The fields a song's search document is built from, for these song ids. */
export async function listSongSearchSources(sql: SqlClient, ids: string[]): Promise<SongSearchSource[]> {
  return (await sql.prepare(`SELECT s.id, s.title, s.titleAlt, s.lyricist, s.composer, s.publishedTapeCount, s.isPublic,
        (SELECT group_concat(a.name, ' | ') FROM song_artist sa JOIN artist a ON a.id = sa.artistId WHERE sa.songId = s.id) AS singers
        FROM song s WHERE s.id IN (SELECT value FROM json_each(?))`).bind(jsonParam(ids)).all<SongSearchSource>()).results;
}

/** The fields an artist's search document is built from, for these artist ids. */
export async function listArtistSearchSources(sql: SqlClient, ids: string[]): Promise<ArtistSearchSource[]> {
  return (await sql.prepare(`SELECT a.id, a.name, a.nameAlt, a.publishedTapeCount,
        EXISTS (SELECT 1 FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = a.id AND s.isPublic = 1) AS hasPublicSong,
        (SELECT group_concat(m.name, ' | ') FROM artist_member m WHERE m.artistId = a.id) AS members
        FROM artist a WHERE a.id IN (SELECT value FROM json_each(?))`).bind(jsonParam(ids)).all<ArtistSearchSource>()).results;
}

/** The fields a label's search document is built from, for these label ids. */
export async function listLabelSearchSources(sql: SqlClient, ids: string[]): Promise<LabelSearchSource[]> {
  return (await sql.prepare('SELECT id, name, nameAlt, publishedTapeCount FROM label WHERE id IN (SELECT value FROM json_each(?))').bind(jsonParam(ids)).all<LabelSearchSource>()).results;
}

/** The fields a collection's search document is built from, for these collection ids. */
export async function listCollectionSearchSources(sql: SqlClient, ids: string[]): Promise<CollectionSearchSource[]> {
  return (await sql.prepare('SELECT id, title, status FROM collection WHERE id IN (SELECT value FROM json_each(?))').bind(jsonParam(ids)).all<CollectionSearchSource>()).results;
}

/** Upserts the documents' search_doc rows and replaces their full-text rows (three statements for one batch). */
export function writeSearchDocumentStmts(sql: SqlClient, docs: SearchDocumentRow[]): D1PreparedStatement[] {
  const payload = jsonParam(docs);
  return [
    sql.prepare(`INSERT INTO search_doc (kind, refId, isPublic, nameKey)
      SELECT json_extract(value,'$.kind'), json_extract(value,'$.refId'), json_extract(value,'$.isPublic'), json_extract(value,'$.nameKey')
      FROM json_each(?) WHERE true ON CONFLICT(kind, refId) DO UPDATE SET isPublic = excluded.isPublic, nameKey = excluded.nameKey`).bind(payload),
    sql.prepare(`DELETE FROM search_fts WHERE rowid IN (SELECT d.docId FROM search_doc d JOIN json_each(?) j
      ON d.kind = json_extract(j.value,'$.kind') AND d.refId = json_extract(j.value,'$.refId'))`).bind(payload),
    sql.prepare(`INSERT INTO search_fts (rowid, text) SELECT d.docId, json_extract(j.value,'$.text') FROM json_each(?) j JOIN search_doc d
      ON d.kind = json_extract(j.value,'$.kind') AND d.refId = json_extract(j.value,'$.refId')`).bind(payload),
  ];
}

/** The next 200 indexable records after the (kind, refId) cursor, in (kind, refId) order. */
export async function listSearchRefsAfter(sql: SqlClient, kind: string, refId: string): Promise<SearchRef[]> {
  return (await sql.prepare(`SELECT kind, refId FROM (
      SELECT 'artist' AS kind, id AS refId FROM artist UNION ALL SELECT 'collection', id FROM collection
      UNION ALL SELECT 'label', id FROM label UNION ALL SELECT 'song', id FROM song UNION ALL SELECT 'tape', id FROM tape
    ) WHERE (kind, refId) > (?, ?) ORDER BY kind, refId LIMIT 200`).bind(kind, refId).all<SearchRef>()).results;
}

/** Queues these records for reindexing (already queued ones stay once). */
export function enqueueSearchRefsStmt(sql: SqlClient, refs: SearchRef[]): D1PreparedStatement {
  return sql.prepare(`INSERT OR IGNORE INTO search_queue (kind, refId) SELECT json_extract(value,'$.kind'), json_extract(value,'$.refId') FROM json_each(?)`).bind(jsonParam(refs));
}

/** Queues every tape and song the artist is credited on (two statements for one batch). */
export function enqueueArtistDependentStmts(sql: SqlClient, artistId: string): D1PreparedStatement[] {
  return [
    sql.prepare("INSERT OR IGNORE INTO search_queue (kind, refId) SELECT 'tape', tapeId FROM tape_artist WHERE artistId = ?").bind(artistId),
    sql.prepare("INSERT OR IGNORE INTO search_queue (kind, refId) SELECT 'song', songId FROM song_artist WHERE artistId = ?").bind(artistId),
  ];
}

/** Queues every tape on the label. */
export async function enqueueLabelDependents(sql: SqlClient, labelId: string): Promise<void> {
  await sql.prepare("INSERT OR IGNORE INTO search_queue (kind, refId) SELECT 'tape', id FROM tape WHERE labelId = ?").bind(labelId).run();
}

/** The first `limit` queued records in (kind, refId) order. */
export async function listQueuedSearchRefs(sql: SqlClient, limit: number): Promise<SearchRef[]> {
  return (await sql.prepare('SELECT kind, refId FROM search_queue ORDER BY kind, refId LIMIT ?').bind(limit).all<SearchRef>()).results;
}

/** Removes these records from the reindex queue. */
export async function dequeueSearchRefs(sql: SqlClient, refs: SearchRef[]): Promise<void> {
  await sql.prepare(`DELETE FROM search_queue WHERE (kind, refId) IN
    (SELECT json_extract(value,'$.kind'), json_extract(value,'$.refId') FROM json_each(?))`).bind(jsonParam(refs)).run();
}
