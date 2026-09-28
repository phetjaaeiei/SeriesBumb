import type { SqlClient } from '../db/sql-client';

export interface GenreOption { id: string; slug: string; name: string }

/** Every genre in display order. */
export async function listGenreOptions(sql: SqlClient): Promise<GenreOption[]> {
  return (await sql.prepare('SELECT id, slug, name FROM genre ORDER BY position').all<GenreOption>()).results;
}

export async function getGenreIdBySlug(sql: SqlClient, slug: string): Promise<{ id: string } | null> {
  return sql.prepare('SELECT id FROM genre WHERE slug = ?').bind(slug).first<{ id: string }>();
}
