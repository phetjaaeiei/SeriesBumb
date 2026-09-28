import type { SqlClient } from '../db/sql-client';

export interface PersonSummary { id: string; name: string; bio: string }

/** A person by slug, or null. */
export async function getPersonBySlug(sql: SqlClient, slug: string): Promise<PersonSummary | null> {
  return sql.prepare('SELECT id, name, bio FROM person WHERE slug = ?').bind(slug).first<PersonSummary>();
}

export interface PersonMembershipRow { artistSlug: string; artistName: string; creditedName: string; role: string; years: string | null; isCurrent: number; sourceTitle: string; sourceUrl: string }

/** The person's sourced memberships in visible artists (published tape or public song), at most 50. */
export async function listPublicPersonMemberships(sql: SqlClient, personId: string): Promise<PersonMembershipRow[]> {
  return (await sql.prepare(`SELECT a.slug AS artistSlug, a.name AS artistName, am.name AS creditedName, am.role, am.years, am.isCurrent, cs.title AS sourceTitle, cs.url AS sourceUrl
  FROM artist_member am JOIN artist a ON a.id = am.artistId JOIN catalog_source cs ON cs.id = am.sourceId
  WHERE am.personId = ? AND (a.publishedTapeCount > 0 OR EXISTS (SELECT 1 FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = a.id AND s.isPublic = 1))
  ORDER BY a.nameSort, am.position LIMIT 50`).bind(personId).all<PersonMembershipRow>()).results;
}
