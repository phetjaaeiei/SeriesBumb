import type { SqlClient } from '../db/sql-client';

/** The site_stats row's published tape counter, or null before the row exists. */
export async function getPublishedTapeCountRow(sql: SqlClient): Promise<{ publishedTapeCount: number } | null> {
  return sql.prepare('SELECT publishedTapeCount FROM site_stats WHERE id = 1').first<{ publishedTapeCount: number }>();
}
