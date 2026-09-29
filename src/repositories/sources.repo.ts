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
