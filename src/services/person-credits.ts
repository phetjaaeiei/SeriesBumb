import type { SqlClient } from '../db/sql-client';
import { getRecordId } from '../repositories/admin.repo';
import { countPersonCredits, deletePersonCreditById, insertPersonCredit, type CreditKind } from '../repositories/credits.repo';
import { getCatalogSourceIdFor } from '../repositories/sources.repo';

export type { CreditKind } from '../repositories/credits.repo';

export async function addPersonCredit(db: SqlClient, input: { personId: string; targetKind: CreditKind; targetId: string; creditedAs: string; role: string; sourceId: string }) {
  const [person, target, source, count] = await Promise.all([
    getRecordId(db, 'person', input.personId),
    getRecordId(db, input.targetKind, input.targetId),
    getCatalogSourceIdFor(db, input.sourceId, input.targetKind, input.targetId),
    countPersonCredits(db, input.targetKind, input.targetId),
  ]);
  if (!person || !target) throw new Error('ไม่พบบุคคลหรือรายการที่ให้เครดิต');
  if (!source) throw new Error('หลักฐานต้องเป็นของรายการที่ให้เครดิต');
  if ((count?.value ?? 0) >= 50) throw new Error('เครดิตเต็ม 50 รายการ');
  const id = crypto.randomUUID();
  await insertPersonCredit(db, { id, personId: input.personId, targetKind: input.targetKind, targetId: input.targetId, creditedAs: input.creditedAs.trim(), role: input.role.trim(), sourceId: input.sourceId, now: Date.now() });
  return { id };
}

export async function deletePersonCredit(db: SqlClient, id: string) {
  await deletePersonCreditById(db, id);
}
