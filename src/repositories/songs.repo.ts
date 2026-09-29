import { jsonParam } from '../db/client';
import type { SqlClient } from '../db/sql-client';
import type { CursorKey } from '../domain/cursor';

export interface SongLink { slug: string; title: string }

/** Songs a guest can see: public ones and those on a published tape. */
export async function countVisibleSongs(sql: SqlClient): Promise<number> {
  return (await sql.prepare('SELECT COUNT(*) AS count FROM song WHERE isPublic = 1 OR publishedTapeCount > 0').first<{ count: number }>())?.count ?? 0;
}

/** The ten most recently updated songs a guest can see. */
export async function listRecentVisibleSongs(sql: SqlClient): Promise<SongLink[]> {
  return (await sql.prepare(`SELECT slug, title FROM song WHERE isPublic = 1 OR publishedTapeCount > 0 ORDER BY updatedAt DESC, id DESC LIMIT 10`).all<SongLink>()).results;
}

/** The twenty most recently updated songs marked public. */
export async function listRecentPublicSongs(sql: SqlClient): Promise<(SongLink & { updatedAt: number })[]> {
  return (await sql.prepare('SELECT slug, title, updatedAt FROM song WHERE isPublic = 1 ORDER BY updatedAt DESC, id DESC LIMIT 20').all<SongLink & { updatedAt: number }>()).results;
}

export interface SongListRow { id: string; slug: string; title: string; titleSort: string; artists: string | null }

/** Up to 51 guest-visible songs by title after `cursor` (one more than a page, so callers can tell if more follow). */
export async function listVisibleSongsByTitle(sql: SqlClient, cursor: { key: CursorKey; id: string } | null): Promise<SongListRow[]> {
  return (await sql.prepare(`SELECT s.id, s.slug, s.title, s.titleSort,
  (SELECT group_concat(a.name, ' / ') FROM song_artist sa JOIN artist a ON a.id = sa.artistId WHERE sa.songId = s.id ORDER BY sa.position) AS artists
  FROM song s WHERE (s.isPublic = 1 OR s.publishedTapeCount > 0)
  ${cursor ? 'AND (s.titleSort, s.id) > (?, ?)' : ''}
  ORDER BY s.titleSort, s.id LIMIT 51`)
    .bind(...(cursor ? [cursor.key, cursor.id] : []))
    .all<SongListRow>()).results;
}

export interface SongDetail { id: string; title: string; titleAlt: string | null; lyricist: string | null; composer: string | null; arranger: string | null; lyrics: string | null; notes: string | null; likeCount: number; commentCount: number; publishedTapeCount: number; isPublic: number; createdAt: number; updatedAt: number; createdByName: string | null; updatedByName: string | null }

/** A song by slug with its creator/editor names; unless `admin`, only songs a guest can see. */
export async function getSongBySlug(sql: SqlClient, slug: string, admin: boolean): Promise<SongDetail | null> {
  return sql.prepare(`SELECT s.*, creator.name AS createdByName, editor.name AS updatedByName FROM song s LEFT JOIN user creator ON creator.id = s.createdBy LEFT JOIN user editor ON editor.id = s.updatedBy WHERE s.slug = ? ${admin ? '' : 'AND (s.isPublic = 1 OR s.publishedTapeCount > 0)'}`).bind(slug).first<SongDetail>();
}

export interface SongArtist { name: string; slug: string }

/** A song's singers in credit order. */
export async function listSongArtists(sql: SqlClient, songId: string): Promise<SongArtist[]> {
  return (await sql.prepare('SELECT a.name, a.slug FROM song_artist sa JOIN artist a ON a.id = sa.artistId WHERE sa.songId = ? ORDER BY sa.position').bind(songId).all<SongArtist>()).results;
}

export interface SongTapeRow { slug: string; title: string; year: number | null; ogImageKey: string | null; side: string; position: number }

/** Up to 100 published tapes that carry the song, oldest first, with the track's side and position. */
export async function listSongPublishedTapes(sql: SqlClient, songId: string): Promise<SongTapeRow[]> {
  return (await sql.prepare(`SELECT t.slug, t.title, t.year, t.ogImageKey, tt.side, tt.position FROM tape_track tt JOIN tape t ON t.id = tt.tapeId WHERE tt.songId = ? AND t.status = 'published' ORDER BY t.yearSort, t.id, tt.side, tt.position LIMIT 100`).bind(songId).all<SongTapeRow>()).results;
}

/** Whether the user has liked the song. */
export async function hasUserLikedSong(sql: SqlClient, userId: string, songId: string): Promise<boolean> {
  return (await sql.prepare('SELECT 1 AS value FROM song_like WHERE userId = ? AND songId = ?').bind(userId, songId).first<{ value: number }>()) !== null;
}

export interface UserSongEntry { id: string; createdAt: number; slug: string; title: string; publishedTapeCount: number }

/** Up to 49 guest-visible songs the user liked, newest like first, after `cursor` (one more than a page). */
export async function listUserLikedSongs(sql: SqlClient, userId: string, cursor: { key: CursorKey; id: string } | null): Promise<UserSongEntry[]> {
  const extra = cursor ? 'AND (e.createdAt, e.songId) < (?, ?)' : '';
  return (await sql.prepare(`SELECT e.songId AS id, e.createdAt, s.slug, s.title, s.publishedTapeCount FROM song_like e JOIN song s ON s.id = e.songId WHERE e.userId = ? AND (s.isPublic = 1 OR s.publishedTapeCount > 0) ${extra} ORDER BY e.createdAt DESC, e.songId DESC LIMIT 49`).bind(userId, ...(cursor ? [cursor.key, cursor.id] : [])).all<UserSongEntry>()).results;
}

/** The song's artist ids in credit order. */
export async function listSongArtistIds(sql: SqlClient, songId: string): Promise<string[]> {
  return (await sql.prepare('SELECT artistId AS id FROM song_artist WHERE songId = ? ORDER BY position').bind(songId).all<{ id: string }>()).results.map(row => row.id);
}

// Writes for the admin song editor and the catalog services that keep song counters in step.

export interface SongInsert { id: string; slug: string; title: string; titleSort: string; lyrics: string | null; userId: string; now: number }

export function insertSongStmt(sql: SqlClient, song: SongInsert): D1PreparedStatement {
  return sql.prepare('INSERT INTO song (id, slug, title, titleSort, lyrics, createdBy, createdAt, updatedBy, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(song.id, song.slug, song.title, song.titleSort, song.lyrics, song.userId, song.now, song.userId, song.now);
}

/** Credits one singer at `position`. */
export function insertSongArtistStmt(sql: SqlClient, songId: string, artistId: string, position: number): D1PreparedStatement {
  return sql.prepare('INSERT INTO song_artist (songId, artistId, position) VALUES (?, ?, ?)').bind(songId, artistId, position);
}

/** Every artist credited on any of these songs, once each, as `{ artistId }` rows. */
export async function listArtistIdsOfSongs(sql: SqlClient, songIds: string[]): Promise<{ artistId: string }[]> {
  return (await sql.prepare(`SELECT DISTINCT artistId FROM song_artist WHERE songId IN (SELECT value FROM json_each(?))`).bind(jsonParam(songIds)).all<{ artistId: string }>()).results;
}

/** Every artist credited on any of these songs, once each, as `{ id }` rows. */
export async function listSingerIdsOfSongs(sql: SqlClient, songIds: string[]): Promise<{ id: string }[]> {
  return (await sql.prepare('SELECT DISTINCT artistId AS id FROM song_artist WHERE songId IN (SELECT value FROM json_each(?))').bind(jsonParam(songIds)).all<{ id: string }>()).results;
}

/** Recounts, for each of these songs, the published tapes that carry it. */
export function refreshSongPublishedTapeCountsStmt(sql: SqlClient, songIds: string[]): D1PreparedStatement {
  return sql.prepare(`UPDATE song SET publishedTapeCount = (SELECT COUNT(DISTINCT t.id) FROM tape_track tt JOIN tape t ON t.id = tt.tapeId WHERE tt.songId = song.id AND t.status = 'published') WHERE id IN (SELECT value FROM json_each(?))`).bind(jsonParam(songIds));
}

export interface SongSaveRow { slug: string; publishedTapeCount: number; isPublic: number }

/** The stored fields saveSong keeps or compares against, or null. */
export async function getSongForSave(sql: SqlClient, id: string): Promise<SongSaveRow | null> {
  return sql.prepare('SELECT slug, publishedTapeCount, isPublic FROM song WHERE id = ?').bind(id).first<SongSaveRow>();
}

/** The song's current singer links (any order). */
export async function listSongArtistLinks(sql: SqlClient, songId: string): Promise<{ artistId: string }[]> {
  return (await sql.prepare('SELECT artistId FROM song_artist WHERE songId = ?').bind(songId).all<{ artistId: string }>()).results;
}

export interface SongUpdate {
  id: string; slug: string; title: string; titleAlt: string | null; titleSort: string; lyricist: string | null; composer: string | null;
  arranger: string | null; lyrics: string | null; notes: string | null; isPublic: number; userId: string; now: number;
}

/** Overwrites every editable column of the song. */
export function updateSongStmt(sql: SqlClient, song: SongUpdate): D1PreparedStatement {
  return sql.prepare('UPDATE song SET slug = ?, title = ?, titleAlt = ?, titleSort = ?, lyricist = ?, composer = ?, arranger = ?, lyrics = ?, notes = ?, isPublic = ?, updatedBy = ?, updatedAt = ? WHERE id = ?').bind(song.slug, song.title, song.titleAlt, song.titleSort, song.lyricist, song.composer, song.arranger, song.lyrics, song.notes, song.isPublic, song.userId, song.now, song.id);
}

export function deleteSongArtistsStmt(sql: SqlClient, songId: string): D1PreparedStatement {
  return sql.prepare('DELETE FROM song_artist WHERE songId = ?').bind(songId);
}

/** Credits the singers in order. */
export function insertSongArtistsStmt(sql: SqlClient, songId: string, artistIds: string[]): D1PreparedStatement {
  return sql.prepare('INSERT INTO song_artist (songId, artistId, position) SELECT ?, value, CAST(key AS INTEGER) FROM json_each(?)').bind(songId, jsonParam(artistIds));
}

export async function getSongSlug(sql: SqlClient, id: string): Promise<{ slug: string } | null> {
  return sql.prepare('SELECT slug FROM song WHERE id = ?').bind(id).first<{ slug: string }>();
}

/** Titles of up to three tapes (drafts included) that still carry the song. */
export async function listSongTapeTitles(sql: SqlClient, songId: string): Promise<{ title: string }[]> {
  return (await sql.prepare('SELECT t.title FROM tape_track tt JOIN tape t ON t.id = tt.tapeId WHERE tt.songId = ? LIMIT 3').bind(songId).all<{ title: string }>()).results;
}

export function deleteSongStmt(sql: SqlClient, id: string): D1PreparedStatement {
  return sql.prepare('DELETE FROM song WHERE id = ?').bind(id);
}
