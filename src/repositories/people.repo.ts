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

export interface PersonChoice { id: string; title: string }

/** Up to 500 people by name as picker choices for person credits. */
export async function listPersonChoices(sql: SqlClient): Promise<PersonChoice[]> {
  return (await sql.prepare('SELECT id, name AS title FROM person ORDER BY name LIMIT 500').all<PersonChoice>()).results;
}

export interface PersonAdminRow { id: string; slug: string; name: string }

/** The first 100 people by name for the admin people manager. */
export async function listPeopleForAdmin(sql: SqlClient): Promise<PersonAdminRow[]> {
  return (await sql.prepare('SELECT id, slug, name FROM person ORDER BY name LIMIT 100').all<PersonAdminRow>()).results;
}

/** The person already using `slug`, or null. */
export async function getPersonIdBySlug(sql: SqlClient, slug: string): Promise<{ id: string } | null> {
  return sql.prepare('SELECT id FROM person WHERE slug = ?').bind(slug).first<{ id: string }>();
}

export async function insertPerson(sql: SqlClient, person: { id: string; slug: string; name: string; now: number }): Promise<void> {
  await sql.prepare('INSERT INTO person (id, slug, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)').bind(person.id, person.slug, person.name, person.now, person.now).run();
}
