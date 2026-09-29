import type { SqlClient } from '../db/sql-client';

export interface GenreOption { id: string; slug: string; name: string }

/** Every genre in display order. */
export async function listGenreOptions(sql: SqlClient): Promise<GenreOption[]> {
  return (await sql.prepare('SELECT id, slug, name FROM genre ORDER BY position').all<GenreOption>()).results;
}

export async function getGenreIdBySlug(sql: SqlClient, slug: string): Promise<{ id: string } | null> {
  return sql.prepare('SELECT id FROM genre WHERE slug = ?').bind(slug).first<{ id: string }>();
}

export interface GenreListRow { slug: string; name: string; publishedTapeCount: number }

/** Every genre in display order with its published tape count. */
export async function listGenres(sql: SqlClient): Promise<GenreListRow[]> {
  return (await sql.prepare('SELECT slug, name, publishedTapeCount FROM genre ORDER BY position').all<GenreListRow>()).results;
}

export interface GenreSummary { id: string; name: string; publishedTapeCount: number }

export async function getGenreBySlug(sql: SqlClient, slug: string): Promise<GenreSummary | null> {
  return sql.prepare('SELECT id, name, publishedTapeCount FROM genre WHERE slug = ?').bind(slug).first<GenreSummary>();
}

/** The first 50 genres in display order, for the advanced search filter. */
export async function listGenreFilterOptions(sql: SqlClient): Promise<{ slug: string; name: string }[]> {
  return (await sql.prepare('SELECT slug, name FROM genre ORDER BY position LIMIT 50').all<{ slug: string; name: string }>()).results;
}
