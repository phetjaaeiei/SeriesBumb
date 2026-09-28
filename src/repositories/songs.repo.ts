import type { SqlClient } from '../db/sql-client';

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
