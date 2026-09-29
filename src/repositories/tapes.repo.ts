import { decodeCursor, encodeCursor, type CatalogSort, type CursorKey } from '../domain/cursor';
import type { ReleaseType } from '../domain/enums';
import type { SqlClient } from '../db/sql-client';

export interface TapeListItem {
  id: string;
  slug: string;
  title: string;
  titleAlt: string | null;
  year: number | null;
  yearSort: number;
  releaseType: ReleaseType;
  labelName: string | null;
  labelSlug: string | null;
  coverThumbKey: string | null;
  publishedAt: number | null;
  updatedAt: number;
  titleSort: string;
  ownerCount: number;
  artists: { name: string; slug: string }[];
}

export interface TapeDetail extends TapeListItem {
  description: string;
  catalogNo: string | null;
  reelUrl: string | null;
  isRare: number;
  status: 'draft' | 'published';
  labelId: string | null;
  decade: number | null;
  coverImageId: string | null;
  publishedAt: number | null;
  ogImageKey: string | null;
  likeCount: number;
  commentCount: number;
  createdAt: number;
  createdByName: string | null;
  updatedByName: string | null;
  images: { id: string; kind: string; fullKey: string; thumbKey: string; width: number; height: number; position: number }[];
  tracks: { id: string; side: string; position: number; durationSec: number | null; note: string | null; songId: string; songSlug: string; songTitle: string; artists: string | null; hasLyrics: number }[];
  genres: { name: string; slug: string }[];
}

export interface TapePageOptions {
  sort?: CatalogSort;
  cursor?: string | null;
  pageSize?: number;
  decade?: number | null;
  genreId?: string | null;
  releaseType?: ReleaseType | null;
  labelId?: string | null;
  artistId?: string | null;
  letter?: string | null;
}

type TapeRow = Omit<TapeListItem, 'artists'>;

async function attachArtists(db: SqlClient, rows: TapeRow[]): Promise<TapeListItem[]> {
  if (!rows.length) return [];
  const placeholders = rows.map(() => '?').join(',');
  const related = await db.prepare(`SELECT ta.tapeId, a.name, a.slug FROM tape_artist ta JOIN artist a ON a.id = ta.artistId WHERE ta.tapeId IN (${placeholders}) ORDER BY ta.tapeId, ta.position`).bind(...rows.map(row => row.id)).all<{ tapeId: string; name: string; slug: string }>();
  const byTape = new Map<string, { name: string; slug: string }[]>();
  for (const row of related.results) {
    const list = byTape.get(row.tapeId) ?? [];
    list.push({ name: row.name, slug: row.slug });
    byTape.set(row.tapeId, list);
  }
  return rows.map(row => ({ ...row, artists: byTape.get(row.id) ?? [] }));
}

export async function getTapeHighlights(db: SqlClient, kind: 'updated' | 'owned', limit = 10): Promise<TapeListItem[]> {
  const order = kind === 'updated' ? 't.updatedAt DESC, t.id DESC' : 't.ownerCount DESC, t.publishedAt DESC, t.id DESC';
  const constraint = kind === 'owned' ? 'AND t.ownerCount > 0' : '';
  const result = await db.prepare(`SELECT t.id, t.slug, t.title, t.titleAlt, t.year, t.yearSort, t.releaseType, t.coverThumbKey, t.publishedAt, t.updatedAt, t.titleSort, t.ownerCount, l.name AS labelName, l.slug AS labelSlug FROM tape t LEFT JOIN label l ON l.id = t.labelId WHERE t.status = 'published' ${constraint} ORDER BY ${order} LIMIT ?`).bind(Math.min(Math.max(limit, 1), 50)).all<TapeRow>();
  return attachArtists(db, result.results);
}

export async function getTapePage(db: SqlClient, options: TapePageOptions = {}): Promise<{ items: TapeListItem[]; nextCursor: string | null }> {
  const sort = options.sort ?? 'new';
  const size = Math.min(Math.max(Math.floor(options.pageSize ?? 24), 1), 50);
  const order = sort === 'year' ? 't.yearSort ASC, t.id ASC' : sort === 'title' ? 't.titleSort ASC, t.id ASC' : 't.publishedAt DESC, t.id DESC';
  const keyColumn = sort === 'year' ? 't.yearSort' : sort === 'title' ? 't.titleSort' : 't.publishedAt';
  const where = ["t.status = 'published'"];
  const bindings: (string | number)[] = [];
  if (options.decade != null) { where.push('t.decade = ?'); bindings.push(options.decade); }
  if (options.genreId) { where.push("EXISTS (SELECT 1 FROM tape_genre tg WHERE tg.tapeId = t.id AND tg.genreId = ? AND tg.isPublished = 1)"); bindings.push(options.genreId); }
  if (options.releaseType) { where.push('t.releaseType = ?'); bindings.push(options.releaseType); }
  if (options.labelId) { where.push('t.labelId = ?'); bindings.push(options.labelId); }
  if (options.artistId) { where.push("EXISTS (SELECT 1 FROM tape_artist ta WHERE ta.tapeId = t.id AND ta.artistId = ? AND ta.isPublished = 1)"); bindings.push(options.artistId); }
  if (options.letter && sort === 'title') {
    const prefix = options.letter === '0-9' ? '0' : `${/[A-Z]/u.test(options.letter) ? '2' : '1'}${options.letter.toLowerCase()}`;
    where.push('t.titleSort >= ? AND t.titleSort < ?');
    bindings.push(prefix, `${prefix}\uffff`);
  }
  const cursor = decodeCursor(sort, options.cursor);
  if (cursor) {
    where.push(`(${keyColumn}, t.id) ${sort === 'new' ? '<' : '>'} (?, ?)`);
    bindings.push(cursor.key, cursor.id);
  }
  const statement = db.prepare(`
    SELECT t.id, t.slug, t.title, t.titleAlt, t.year, t.yearSort, t.releaseType,
      t.coverThumbKey, t.publishedAt, t.updatedAt, t.titleSort, t.ownerCount,
      l.name AS labelName, l.slug AS labelSlug
    FROM tape t LEFT JOIN label l ON l.id = t.labelId
    WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?
  `).bind(...bindings, size + 1);
  const result = await statement.all<TapeRow>();
  const hasMore = result.results.length > size;
  const rows = result.results.slice(0, size);
  const items = await attachArtists(db, rows);
  const last = rows.at(-1);
  const key = last && (sort === 'year' ? last.yearSort : sort === 'title' ? last.titleSort : last.publishedAt);
  return { items, nextCursor: hasMore && last && key != null ? encodeCursor(sort, key, last.id) : null };
}

export async function getTapeBySlug(db: SqlClient, slug: string, admin = false): Promise<TapeDetail | null> {
  const row = await db.prepare(`
    SELECT t.*, l.name AS labelName, l.slug AS labelSlug,
      creator.name AS createdByName, editor.name AS updatedByName
    FROM tape t
    LEFT JOIN label l ON l.id = t.labelId
    LEFT JOIN user creator ON creator.id = t.createdBy
    LEFT JOIN user editor ON editor.id = t.updatedBy
    WHERE t.slug = ? ${admin ? '' : "AND t.status = 'published'"} LIMIT 1
  `).bind(slug).first<Omit<TapeDetail, 'artists' | 'images' | 'tracks' | 'genres'>>();
  if (!row) return null;
  const [artists, images, tracks, genres] = await Promise.all([
    db.prepare('SELECT a.name, a.slug FROM tape_artist ta JOIN artist a ON a.id = ta.artistId WHERE ta.tapeId = ? ORDER BY ta.position').bind(row.id).all<{ name: string; slug: string }>(),
    db.prepare('SELECT id, kind, fullKey, thumbKey, width, height, position FROM tape_image WHERE tapeId = ? ORDER BY position').bind(row.id).all<TapeDetail['images'][number]>(),
    db.prepare(`SELECT tt.id, tt.side, tt.position, tt.durationSec, tt.note, s.id AS songId, s.slug AS songSlug, s.title AS songTitle,
      (s.lyrics IS NOT NULL AND s.lyrics != '') AS hasLyrics,
      (SELECT group_concat(a.name, ', ') FROM song_artist sa JOIN artist a ON a.id = sa.artistId WHERE sa.songId = s.id ORDER BY sa.position) AS artists
      FROM tape_track tt JOIN song s ON s.id = tt.songId WHERE tt.tapeId = ? ORDER BY tt.side, tt.position`).bind(row.id).all<TapeDetail['tracks'][number]>(),
    db.prepare('SELECT g.name, g.slug FROM tape_genre tg JOIN genre g ON g.id = tg.genreId WHERE tg.tapeId = ? ORDER BY g.position').bind(row.id).all<TapeDetail['genres'][number]>(),
  ]);
  return { ...row, artists: artists.results, images: images.results, tracks: tracks.results, genres: genres.results };
}

export interface RelatedTape { slug: string; title: string; year: number | null }

/** Other published tapes by the artist with this slug, oldest first. */
export async function listRelatedTapesByArtist(sql: SqlClient, artistSlug: string, excludeTapeId: string): Promise<RelatedTape[]> {
  return (await sql.prepare(`SELECT t.slug, t.title, t.year FROM tape_artist ta JOIN artist a ON a.id = ta.artistId JOIN tape t ON t.id = ta.tapeId WHERE a.slug = ? AND t.status = 'published' AND t.id != ? ORDER BY t.yearSort, t.id LIMIT 8`).bind(artistSlug, excludeTapeId).all<RelatedTape>()).results;
}

/** Other published tapes on this label, oldest first. */
export async function listRelatedTapesByLabel(sql: SqlClient, labelId: string, excludeTapeId: string): Promise<RelatedTape[]> {
  return (await sql.prepare("SELECT slug, title, year FROM tape WHERE labelId = ? AND status = 'published' AND id != ? ORDER BY yearSort, id LIMIT 8").bind(labelId, excludeTapeId).all<RelatedTape>()).results;
}

export interface TapeViewerEngagement { liked: number; owned: number }

/** Whether this user liked and owns the tape (0/1 flags), or null when the query returns no row. */
export async function getTapeViewerEngagement(sql: SqlClient, userId: string, tapeId: string): Promise<TapeViewerEngagement | null> {
  return sql.prepare('SELECT EXISTS(SELECT 1 FROM tape_like WHERE userId = ? AND tapeId = ?) AS liked, EXISTS(SELECT 1 FROM tape_owner WHERE userId = ? AND tapeId = ?) AS owned').bind(userId, tapeId, userId, tapeId).first<TapeViewerEngagement>();
}

/** The highest rowid in `tape` (drafts included), or null on an empty table. */
export async function getMaxTapeRowid(sql: SqlClient): Promise<{ value: number | null } | null> {
  return sql.prepare('SELECT max(rowid) AS value FROM tape').first<{ value: number | null }>();
}

/** The first published tape at or after `rowid`, in rowid order. */
export async function getPublishedTapeSlugFromRowid(sql: SqlClient, rowid: number): Promise<{ slug: string } | null> {
  return sql.prepare("SELECT slug FROM tape WHERE status = 'published' AND rowid >= ? ORDER BY rowid LIMIT 1").bind(rowid).first<{ slug: string }>();
}

/** The published tape with the lowest rowid. */
export async function getFirstPublishedTapeSlug(sql: SqlClient): Promise<{ slug: string } | null> {
  return sql.prepare("SELECT slug FROM tape WHERE status = 'published' ORDER BY rowid LIMIT 1").first<{ slug: string }>();
}

export interface UserTapeEntry { id: string; createdAt: number; slug: string; title: string; year: number | null; coverThumbKey: string | null }

/** Up to 49 published tapes the user liked (`tape_like`) or owns (`tape_owner`), newest first, after `cursor` (one more than a page). */
export async function listUserTapeEntries(sql: SqlClient, table: 'tape_like' | 'tape_owner', userId: string, cursor: { key: CursorKey; id: string } | null): Promise<UserTapeEntry[]> {
  const extra = cursor ? 'AND (e.createdAt, e.tapeId) < (?, ?)' : '';
  return (await sql.prepare(`SELECT e.tapeId AS id, e.createdAt, t.slug, t.title, t.year, t.coverThumbKey FROM ${table} e JOIN tape t ON t.id = e.tapeId WHERE e.userId = ? AND t.status = 'published' ${extra} ORDER BY e.createdAt DESC, e.tapeId DESC LIMIT 49`).bind(userId, ...(cursor ? [cursor.key, cursor.id] : [])).all<UserTapeEntry>()).results;
}
