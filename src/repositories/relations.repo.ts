import type { SqlClient } from '../db/sql-client';

export interface RelationChoice { id: string; title: string }
export interface ArtistRelationAdminRow { id: string; targetTitle: string; relationType: string }
export interface TapeEditionAdminRow { id: string; targetTitle: string; format: string; editionYear: number | null }

/** The first 100 artists by name, or tapes by title, that a relation can point to. */
export async function listRelationChoices(sql: SqlClient, kind: 'artist' | 'tape'): Promise<RelationChoice[]> {
  const table = kind === 'artist' ? 'artist' : 'tape';
  const column = kind === 'artist' ? 'name' : 'title';
  return (await sql.prepare(`SELECT id, ${column} AS title FROM ${table} ORDER BY ${kind === 'artist' ? 'nameSort' : 'titleSort'} LIMIT 100`).all<RelationChoice>()).results;
}

/** The artist's relations (drafts included) with the related artist's name, at most 50. */
export async function listArtistRelationsForAdmin(sql: SqlClient, artistId: string): Promise<ArtistRelationAdminRow[]> {
  return (await sql.prepare('SELECT ar.id, a.name AS targetTitle, ar.relationType FROM artist_relation ar JOIN artist a ON a.id = ar.relatedArtistId WHERE ar.artistId = ? ORDER BY a.nameSort LIMIT 50').bind(artistId).all<ArtistRelationAdminRow>()).results;
}

/** The tape's other editions (drafts included) with the related tape's title, at most 50. */
export async function listTapeEditionsForAdmin(sql: SqlClient, tapeId: string): Promise<TapeEditionAdminRow[]> {
  return (await sql.prepare('SELECT te.id, t.title AS targetTitle, te.format, te.editionYear FROM tape_edition te JOIN tape t ON t.id = te.relatedTapeId WHERE te.tapeId = ? ORDER BY t.titleSort LIMIT 50').bind(tapeId).all<TapeEditionAdminRow>()).results;
}
