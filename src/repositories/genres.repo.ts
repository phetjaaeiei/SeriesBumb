import { jsonParam } from '../db/client';
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

// Writes for the admin genre editor and the catalog services that keep genre counters in step.

/** A new genre after the last one in display order. */
export async function insertGenre(sql: SqlClient, id: string, slug: string, name: string): Promise<void> {
  await sql.prepare('INSERT INTO genre (id, slug, name, position) VALUES (?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM genre))').bind(id, slug, name).run();
}

/** Recounts, for each of these genres, its published tapes. */
export function refreshGenrePublishedTapeCountsStmt(sql: SqlClient, genreIds: string[]): D1PreparedStatement {
  return sql.prepare(`UPDATE genre SET publishedTapeCount = (SELECT COUNT(*) FROM tape_genre WHERE genreId = genre.id AND isPublished = 1) WHERE id IN (SELECT value FROM json_each(?))`).bind(jsonParam(genreIds));
}

export async function getGenreSlug(sql: SqlClient, id: string): Promise<{ slug: string } | null> {
  return sql.prepare('SELECT slug FROM genre WHERE id = ?').bind(id).first<{ slug: string }>();
}

/** Renames the genre and sets its slug; `position` null keeps the current one. */
export function updateGenreStmt(sql: SqlClient, id: string, name: string, slug: string, position: number | null): D1PreparedStatement {
  return sql.prepare('UPDATE genre SET name = ?, slug = ?, position = COALESCE(?, position) WHERE id = ?').bind(name, slug, position, id);
}

/** How many tapes (drafts included) carry the genre, as a `{ count }` row. */
export async function countGenreTapes(sql: SqlClient, id: string): Promise<{ count: number } | null> {
  return sql.prepare('SELECT COUNT(*) AS count FROM tape_genre WHERE genreId = ?').bind(id).first<{ count: number }>();
}

export function deleteGenreStmt(sql: SqlClient, id: string): D1PreparedStatement {
  return sql.prepare('DELETE FROM genre WHERE id = ?').bind(id);
}
