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
