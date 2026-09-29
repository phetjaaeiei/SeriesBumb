// Admin-only reads that span several catalog tables: the editor's record and picker labels,
// the pickers' lookup, the record titles the sources/relations/credits pages lead with, and the
// slug lookup the catalog services use to keep slugs unique.
import type { SqlClient } from '../db/sql-client';
import type { AdminCatalogKind } from './admin-catalog.repo';

export type AdminRecord = Record<string, string | number | null>;
export interface AdminChoice { id: string; label: string }

const recordTables = { tapes: 'tape', songs: 'song', artists: 'artist', labels: 'label', genres: 'genre', collections: 'collection' } as const satisfies Record<AdminCatalogKind, string>;

/** Every column of one catalog record for the admin editor, or null. */
export async function getAdminRecord(sql: SqlClient, kind: AdminCatalogKind, id: string): Promise<AdminRecord | null> {
  return sql.prepare(`SELECT * FROM ${recordTables[kind]} WHERE id = ?`).bind(id).first<AdminRecord>();
}

/** Picker labels for ids that may be artists, genres, labels, songs or tapes (names for the first three, titles for the rest). */
export async function listAdminChoicesByIds(sql: SqlClient, ids: string[]): Promise<AdminChoice[]> {
  return (await sql.prepare(`SELECT id, name AS label FROM artist WHERE id IN (SELECT value FROM json_each(?)) UNION ALL SELECT id, name AS label FROM genre WHERE id IN (SELECT value FROM json_each(?)) UNION ALL SELECT id, name AS label FROM label WHERE id IN (SELECT value FROM json_each(?)) UNION ALL SELECT id, title AS label FROM song WHERE id IN (SELECT value FROM json_each(?)) UNION ALL SELECT id, title AS label FROM tape WHERE id IN (SELECT value FROM json_each(?))`).bind(...Array(5).fill(JSON.stringify(ids))).all<AdminChoice>()).results;
}

export type AdminLookupKind = 'artists' | 'labels' | 'genres' | 'songs' | 'tapes';

/** Up to 20 records whose lowercased name (title for songs and tapes) matches the LIKE pattern `term`, escaped with `\`. */
export async function lookupAdminChoices(sql: SqlClient, kind: AdminLookupKind, term: string): Promise<AdminChoice[]> {
  const table = { artists: 'artist', labels: 'label', genres: 'genre', songs: 'song', tapes: 'tape' }[kind];
  const column = kind === 'songs' || kind === 'tapes' ? 'title' : 'name';
  return (await sql.prepare(`SELECT id, ${column} AS label FROM ${table} WHERE lower(${column}) LIKE ? ESCAPE '\\' ORDER BY ${column} LIMIT 20`).bind(term).all<{ id: string; label: string }>()).results;
}

export type CatalogEntityKind = 'artist' | 'tape' | 'song';

/** The artist's name or the tape's or song's title, or null when the record does not exist. */
export async function getCatalogEntityTitle(sql: SqlClient, kind: CatalogEntityKind, id: string): Promise<{ title: string } | null> {
  const table = kind === 'artist' ? 'artist' : kind === 'tape' ? 'tape' : 'song';
  const column = kind === 'artist' ? 'name' : 'title';
  return sql.prepare(`SELECT ${column} AS title FROM ${table} WHERE id = ?`).bind(id).first<{ title: string }>();
}

/** The title of the tape or song that person credits attach to, or null. */
export async function getCreditTargetTitle(sql: SqlClient, kind: 'tape' | 'song', id: string): Promise<{ title: string } | null> {
  return sql.prepare(`SELECT title FROM ${kind} WHERE id = ?`).bind(id).first<{ title: string }>();
}

export type CatalogSlugTable = 'artist' | 'label' | 'genre' | 'song' | 'tape' | 'collection';

/** The id of the record in `table` that already uses `slug`, or null when the slug is free there. */
export async function getCatalogIdBySlug(sql: SqlClient, table: CatalogSlugTable, slug: string): Promise<{ id: string } | null> {
  return sql.prepare(`SELECT id FROM ${table} WHERE slug = ?`).bind(slug).first<{ id: string }>();
}
