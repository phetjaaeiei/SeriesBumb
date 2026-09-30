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

export type RelationType = 'former_name' | 'collaboration' | 'related';
export type EditionFormat = 'cassette' | 'cd' | 'digital' | 'other';

export interface ArtistRelationInsert { id: string; artistId: string; relatedArtistId: string; relationType: RelationType; sourceId: string; now: number }

export async function insertArtistRelation(sql: SqlClient, relation: ArtistRelationInsert): Promise<void> {
  await sql.prepare('INSERT INTO artist_relation (id, artistId, relatedArtistId, relationType, sourceId, createdAt) VALUES (?, ?, ?, ?, ?, ?)').bind(relation.id, relation.artistId, relation.relatedArtistId, relation.relationType, relation.sourceId, relation.now).run();
}

/** How many other editions the tape links to, as a `{ value }` row. */
export async function countTapeEditions(sql: SqlClient, tapeId: string): Promise<{ value: number } | null> {
  return sql.prepare('SELECT COUNT(*) AS value FROM tape_edition WHERE tapeId = ?').bind(tapeId).first<{ value: number }>();
}

export interface TapeEditionInsert { id: string; tapeId: string; relatedTapeId: string; format: EditionFormat; editionYear: number | null; note: string; sourceId: string; now: number }

export async function insertTapeEdition(sql: SqlClient, edition: TapeEditionInsert): Promise<void> {
  await sql.prepare('INSERT INTO tape_edition (id, tapeId, relatedTapeId, format, editionYear, note, sourceId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(edition.id, edition.tapeId, edition.relatedTapeId, edition.format, edition.editionYear, edition.note, edition.sourceId, edition.now).run();
}

export async function deleteArtistRelationById(sql: SqlClient, id: string): Promise<void> {
  await sql.prepare('DELETE FROM artist_relation WHERE id = ?').bind(id).run();
}

export async function deleteTapeEditionById(sql: SqlClient, id: string): Promise<void> {
  await sql.prepare('DELETE FROM tape_edition WHERE id = ?').bind(id).run();
}

export interface PublicArtistRelation { relationType: RelationType; slug: string; name: string; sourceTitle: string; sourceUrl: string }

/** The artist's sourced relations to visible artists (published tape or public song), by name, at most 50. */
export async function publicArtistRelations(sql: SqlClient, artistId: string): Promise<PublicArtistRelation[]> {
  return (await sql.prepare(`SELECT ar.relationType, a.slug, a.name, cs.title AS sourceTitle, cs.url AS sourceUrl FROM artist_relation ar
    JOIN artist a ON a.id = ar.relatedArtistId JOIN catalog_source cs ON cs.id = ar.sourceId
    WHERE ar.artistId = ? AND (a.publishedTapeCount > 0 OR EXISTS (SELECT 1 FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = a.id AND s.isPublic = 1))
    ORDER BY a.nameSort LIMIT 50`).bind(artistId).all<PublicArtistRelation>()).results;
}

export interface PublicTapeEdition { format: EditionFormat; editionYear: number | null; note: string; slug: string; title: string; sourceTitle: string; sourceUrl: string }

/** The tape's sourced editions that are published tapes, by edition year then title, at most 50. */
export async function publicTapeEditions(sql: SqlClient, tapeId: string): Promise<PublicTapeEdition[]> {
  return (await sql.prepare(`SELECT te.format, te.editionYear, te.note, t.slug, t.title, cs.title AS sourceTitle, cs.url AS sourceUrl FROM tape_edition te
    JOIN tape t ON t.id = te.relatedTapeId JOIN catalog_source cs ON cs.id = te.sourceId
    WHERE te.tapeId = ? AND t.status = 'published' ORDER BY te.editionYear, t.titleSort LIMIT 50`).bind(tapeId).all<PublicTapeEdition>()).results;
}
