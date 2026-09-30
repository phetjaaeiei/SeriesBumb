import type { SqlClient } from '../db/sql-client';

export interface SourceChoice { id: string; title: string }

/** The record's 50 newest catalog sources as picker choices. */
export async function listSourceChoices(sql: SqlClient, entityKind: string, entityId: string): Promise<SourceChoice[]> {
  return (await sql.prepare('SELECT id, title FROM catalog_source WHERE entityKind = ? AND entityId = ? ORDER BY createdAt DESC LIMIT 50').bind(entityKind, entityId).all<SourceChoice>()).results;
}

/** The artist's 50 newest catalog sources as picker choices. */
export async function listArtistSourceChoices(sql: SqlClient, artistId: string): Promise<SourceChoice[]> {
  return (await sql.prepare("SELECT id, title FROM catalog_source WHERE entityKind = 'artist' AND entityId = ? ORDER BY createdAt DESC LIMIT 50").bind(artistId).all<SourceChoice>()).results;
}

export type SourceKind = 'artist' | 'tape' | 'song';
export interface CatalogSource { id: string; entityKind: SourceKind; entityId: string; title: string; url: string; claim: string; accessedAt: number }

/** The record's 50 newest catalog sources. */
export async function listCatalogSources(sql: SqlClient, entityKind: SourceKind, entityId: string): Promise<CatalogSource[]> {
  return (await sql.prepare('SELECT id, entityKind, entityId, title, url, claim, accessedAt FROM catalog_source WHERE entityKind = ? AND entityId = ? ORDER BY createdAt DESC LIMIT 50')
    .bind(entityKind, entityId).all<CatalogSource>()).results;
}

/** `{ id }` when the source belongs to that record, or null. */
export async function getCatalogSourceIdFor(sql: SqlClient, sourceId: string, entityKind: SourceKind, entityId: string): Promise<{ id: string } | null> {
  return sql.prepare('SELECT id FROM catalog_source WHERE id = ? AND entityKind = ? AND entityId = ?').bind(sourceId, entityKind, entityId).first<{ id: string }>();
}

/** `{ id }` when the source belongs to that artist, or null. */
export async function getArtistCatalogSourceId(sql: SqlClient, sourceId: string, artistId: string): Promise<{ id: string } | null> {
  return sql.prepare("SELECT id FROM catalog_source WHERE id = ? AND entityKind = 'artist' AND entityId = ?").bind(sourceId, artistId).first<{ id: string }>();
}

export interface CatalogSourceInsert { id: string; entityKind: SourceKind; entityId: string; title: string; url: string; claim: string; accessedAt: number; createdBy: string; now: number }

export async function insertCatalogSource(sql: SqlClient, source: CatalogSourceInsert): Promise<void> {
  await sql.prepare('INSERT INTO catalog_source (id, entityKind, entityId, title, url, claim, accessedAt, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(source.id, source.entityKind, source.entityId, source.title, source.url, source.claim, source.accessedAt, source.createdBy, source.now).run();
}

export async function deleteCatalogSourceById(sql: SqlClient, id: string): Promise<void> {
  await sql.prepare('DELETE FROM catalog_source WHERE id = ?').bind(id).run();
}
