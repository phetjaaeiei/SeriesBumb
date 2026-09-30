// Sourced person credits on tapes and songs (producer, arranger, cover art…).
import type { SqlClient } from '../db/sql-client';

export type CreditKind = 'tape' | 'song';

/** How many credits the tape or song has, as a `{ value }` row. */
export async function countPersonCredits(sql: SqlClient, targetKind: CreditKind, targetId: string): Promise<{ value: number } | null> {
  return sql.prepare('SELECT COUNT(*) AS value FROM person_credit WHERE targetKind = ? AND targetId = ?').bind(targetKind, targetId).first<{ value: number }>();
}

export interface PersonCreditInsert { id: string; personId: string; targetKind: CreditKind; targetId: string; creditedAs: string; role: string; sourceId: string; now: number }

export async function insertPersonCredit(sql: SqlClient, credit: PersonCreditInsert): Promise<void> {
  await sql.prepare('INSERT INTO person_credit (id, personId, targetKind, targetId, creditedAs, role, sourceId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(credit.id, credit.personId, credit.targetKind, credit.targetId, credit.creditedAs, credit.role, credit.sourceId, credit.now).run();
}

export async function deletePersonCreditById(sql: SqlClient, id: string): Promise<void> {
  await sql.prepare('DELETE FROM person_credit WHERE id = ?').bind(id).run();
}

export interface TargetCredit { id: string; creditedAs: string; role: string; personSlug: string; personName: string; sourceTitle: string; sourceUrl: string }

/** The tape's or song's credits with person and source, oldest first, at most 50. */
export async function creditsForTarget(sql: SqlClient, kind: CreditKind, id: string): Promise<TargetCredit[]> {
  return (await sql.prepare(`SELECT pc.id, pc.creditedAs, pc.role, p.slug AS personSlug, p.name AS personName, cs.title AS sourceTitle, cs.url AS sourceUrl
    FROM person_credit pc JOIN person p ON p.id = pc.personId JOIN catalog_source cs ON cs.id = pc.sourceId
    WHERE pc.targetKind = ? AND pc.targetId = ? ORDER BY pc.createdAt, pc.id LIMIT 50`).bind(kind, id)
    .all<TargetCredit>()).results;
}

export interface PersonPublicCredit { creditedAs: string; role: string; targetKind: CreditKind; tapeSlug: string | null; tapeTitle: string | null; songSlug: string | null; songTitle: string | null; sourceTitle: string; sourceUrl: string }

/** The person's credits on published tapes and visible songs, newest first, at most 100. */
export async function publicCreditsForPerson(sql: SqlClient, personId: string): Promise<PersonPublicCredit[]> {
  return (await sql.prepare(`SELECT pc.creditedAs, pc.role, pc.targetKind, t.slug AS tapeSlug, t.title AS tapeTitle, s.slug AS songSlug, s.title AS songTitle, cs.title AS sourceTitle, cs.url AS sourceUrl
    FROM person_credit pc LEFT JOIN tape t ON pc.targetKind = 'tape' AND t.id = pc.targetId AND t.status = 'published'
    LEFT JOIN song s ON pc.targetKind = 'song' AND s.id = pc.targetId AND (s.isPublic = 1 OR s.publishedTapeCount > 0)
    JOIN catalog_source cs ON cs.id = pc.sourceId
    WHERE pc.personId = ? AND (t.id IS NOT NULL OR s.id IS NOT NULL) ORDER BY pc.createdAt DESC LIMIT 100`).bind(personId)
    .all<PersonPublicCredit>()).results;
}
