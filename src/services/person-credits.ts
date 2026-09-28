import type { SqlClient } from '../db/sql-client';

export type CreditKind = 'tape' | 'song';

export async function addPersonCredit(db: D1Database, input: { personId: string; targetKind: CreditKind; targetId: string; creditedAs: string; role: string; sourceId: string }) {
  const [person, target, source, count] = await Promise.all([
    db.prepare('SELECT id FROM person WHERE id = ?').bind(input.personId).first(),
    db.prepare(`SELECT id FROM ${input.targetKind} WHERE id = ?`).bind(input.targetId).first(),
    db.prepare('SELECT id FROM catalog_source WHERE id = ? AND entityKind = ? AND entityId = ?').bind(input.sourceId, input.targetKind, input.targetId).first(),
    db.prepare('SELECT COUNT(*) AS value FROM person_credit WHERE targetKind = ? AND targetId = ?').bind(input.targetKind, input.targetId).first<{ value: number }>(),
  ]);
  if (!person || !target) throw new Error('ไม่พบบุคคลหรือรายการที่ให้เครดิต');
  if (!source) throw new Error('หลักฐานต้องเป็นของรายการที่ให้เครดิต');
  if ((count?.value ?? 0) >= 50) throw new Error('เครดิตเต็ม 50 รายการ');
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO person_credit (id, personId, targetKind, targetId, creditedAs, role, sourceId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, input.personId, input.targetKind, input.targetId, input.creditedAs.trim(), input.role.trim(), input.sourceId, Date.now()).run();
  return { id };
}

export async function deletePersonCredit(db: D1Database, id: string) {
  await db.prepare('DELETE FROM person_credit WHERE id = ?').bind(id).run();
}

export async function creditsForTarget(db: SqlClient, kind: CreditKind, id: string) {
  return (await db.prepare(`SELECT pc.id, pc.creditedAs, pc.role, p.slug AS personSlug, p.name AS personName, cs.title AS sourceTitle, cs.url AS sourceUrl
    FROM person_credit pc JOIN person p ON p.id = pc.personId JOIN catalog_source cs ON cs.id = pc.sourceId
    WHERE pc.targetKind = ? AND pc.targetId = ? ORDER BY pc.createdAt, pc.id LIMIT 50`).bind(kind, id)
    .all<{ id: string; creditedAs: string; role: string; personSlug: string; personName: string; sourceTitle: string; sourceUrl: string }>()).results;
}

export async function publicCreditsForPerson(db: SqlClient, personId: string) {
  return (await db.prepare(`SELECT pc.creditedAs, pc.role, pc.targetKind, t.slug AS tapeSlug, t.title AS tapeTitle, s.slug AS songSlug, s.title AS songTitle, cs.title AS sourceTitle, cs.url AS sourceUrl
    FROM person_credit pc LEFT JOIN tape t ON pc.targetKind = 'tape' AND t.id = pc.targetId AND t.status = 'published'
    LEFT JOIN song s ON pc.targetKind = 'song' AND s.id = pc.targetId AND (s.isPublic = 1 OR s.publishedTapeCount > 0)
    JOIN catalog_source cs ON cs.id = pc.sourceId
    WHERE pc.personId = ? AND (t.id IS NOT NULL OR s.id IS NOT NULL) ORDER BY pc.createdAt DESC LIMIT 100`).bind(personId)
    .all<{ creditedAs: string; role: string; targetKind: CreditKind; tapeSlug: string | null; tapeTitle: string | null; songSlug: string | null; songTitle: string | null; sourceTitle: string; sourceUrl: string }>()).results;
}
