import type { SqlClient } from '../db/sql-client';

/** The site_stats row's published tape counter, or null before the row exists. */
export async function getPublishedTapeCountRow(sql: SqlClient): Promise<{ publishedTapeCount: number } | null> {
  return sql.prepare('SELECT publishedTapeCount FROM site_stats WHERE id = 1').first<{ publishedTapeCount: number }>();
}

export interface SiteStatsRow {
  tapeCount: number;
  publishedTapeCount: number;
  songCount: number;
  userCount: number;
  imageBytes: number;
  reindexCursor: string | null;
}

/** The site_stats row (null before it exists) and the database size D1 reports with the read (null when it does not). */
export async function getSiteStatsWithDatabaseSize(sql: SqlClient): Promise<{ stats: SiteStatsRow | null; dbBytes: number | null }> {
  const result = await sql.prepare('SELECT tapeCount, publishedTapeCount, songCount, userCount, imageBytes, reindexCursor FROM site_stats WHERE id = 1').run<SiteStatsRow>();
  return { stats: result.results[0] ?? null, dbBytes: typeof result.meta.size_after === 'number' ? result.meta.size_after : null };
}

// Counter writes. Each returns one prepared statement so the calling service keeps it in the same
// atomic batch as the catalog change it accounts for.

export function incrementSongCountStmt(sql: SqlClient, now: number): D1PreparedStatement {
  return sql.prepare('UPDATE site_stats SET songCount = songCount + 1, updatedAt = ? WHERE id = 1').bind(now);
}

export function decrementSongCountStmt(sql: SqlClient, now: number): D1PreparedStatement {
  return sql.prepare('UPDATE site_stats SET songCount = MAX(0, songCount - 1), updatedAt = ? WHERE id = 1').bind(now);
}

export function incrementTapeCountStmt(sql: SqlClient, now: number): D1PreparedStatement {
  return sql.prepare('UPDATE site_stats SET tapeCount = tapeCount + 1, updatedAt = ? WHERE id = 1').bind(now);
}

/** Adds `delta` (negative when a tape is unpublished) to the published tape counter. */
export function adjustPublishedTapeCountStmt(sql: SqlClient, delta: number, now: number): D1PreparedStatement {
  return sql.prepare('UPDATE site_stats SET publishedTapeCount = publishedTapeCount + ?, updatedAt = ? WHERE id = 1').bind(delta, now);
}

/** Removes one tape from the counters: `published` is 1 when it was published, `imageBytes` what its images used. */
export function recordTapeDeletedStmt(sql: SqlClient, published: number, imageBytes: number, now: number): D1PreparedStatement {
  return sql.prepare('UPDATE site_stats SET tapeCount = MAX(0, tapeCount - 1), publishedTapeCount = MAX(0, publishedTapeCount - ?), imageBytes = MAX(0, imageBytes - ?), updatedAt = ? WHERE id = 1').bind(published, imageBytes, now);
}

/** Adds `bytes` to the image storage counter. */
export function addImageBytesStmt(sql: SqlClient, bytes: number, now: number): D1PreparedStatement {
  return sql.prepare('UPDATE site_stats SET imageBytes = imageBytes + ?, updatedAt = ? WHERE id = 1').bind(bytes, now);
}

/** Adds `delta` (may be negative) to the image storage counter, never going below zero. */
export function adjustImageBytesStmt(sql: SqlClient, delta: number, now: number): D1PreparedStatement {
  return sql.prepare('UPDATE site_stats SET imageBytes = MAX(0, imageBytes + ?), updatedAt = ? WHERE id = 1').bind(delta, now);
}

/** Subtracts `bytes` from the image storage counter, never going below zero. */
export function subtractImageBytesStmt(sql: SqlClient, bytes: number, now: number): D1PreparedStatement {
  return sql.prepare('UPDATE site_stats SET imageBytes = MAX(0, imageBytes - ?), updatedAt = ? WHERE id = 1').bind(bytes, now);
}

/** The image storage counter, or null before the site_stats row exists. */
export async function getImageBytesRow(sql: SqlClient): Promise<{ imageBytes: number } | null> {
  return sql.prepare('SELECT imageBytes FROM site_stats WHERE id = 1').first<{ imageBytes: number }>();
}

export interface ReindexState { reindexCursor: string | null; reindexDay: string | null; reindexRowsWritten: number }

/** The search rebuild cursor and today's reindex write tally, or null before the site_stats row exists. */
export async function getReindexState(sql: SqlClient): Promise<ReindexState | null> {
  return sql.prepare('SELECT reindexCursor, reindexDay, reindexRowsWritten FROM site_stats WHERE id = 1').first<ReindexState>();
}

/** Sets the full-rebuild cursor (a JSON [kind, refId] pair), or null when the rebuild has walked every record. */
export function setReindexCursorStmt(sql: SqlClient, cursor: string | null): D1PreparedStatement {
  return sql.prepare('UPDATE site_stats SET reindexCursor = ? WHERE id = 1').bind(cursor);
}

/** Runs setReindexCursorStmt on its own. */
export async function setReindexCursor(sql: SqlClient, cursor: string | null): Promise<void> {
  await setReindexCursorStmt(sql, cursor).run();
}

export async function clearReindexCursor(sql: SqlClient): Promise<void> {
  await sql.prepare('UPDATE site_stats SET reindexCursor = NULL WHERE id = 1').run();
}

/** Stores the day and the search rows written on it by reindexing. */
export async function recordReindexProgress(sql: SqlClient, day: string, rowsWritten: number, now: number): Promise<void> {
  await sql.prepare('UPDATE site_stats SET reindexDay = ?, reindexRowsWritten = ?, updatedAt = ? WHERE id = 1').bind(day, rowsWritten, now).run();
}
