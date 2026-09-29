import type { SqlClient } from '../db/sql-client';
import { getRecordId } from '../repositories/admin.repo';
import { deleteCatalogSourceById, insertCatalogSource, type CatalogSource } from '../repositories/sources.repo';

export type { CatalogSource, SourceKind } from '../repositories/sources.repo';

export function validateSourceUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port || /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/iu.test(url.hostname)) throw new Error('แหล่งอ้างอิงต้องเป็นลิงก์ https สาธารณะ');
  return url.href;
}

export async function addCatalogSource(db: SqlClient, adminId: string, input: Omit<CatalogSource, 'id'>): Promise<CatalogSource> {
  const table = input.entityKind === 'artist' ? 'artist' : input.entityKind === 'tape' ? 'tape' : 'song';
  const exists = await getRecordId(db, table, input.entityId);
  if (!exists) throw new Error('ไม่พบรายการที่อ้างอิง');
  const url = validateSourceUrl(input.url);
  const id = crypto.randomUUID();
  const now = Date.now();
  await insertCatalogSource(db, { id, entityKind: input.entityKind, entityId: input.entityId, title: input.title.trim(), url, claim: input.claim.trim(), accessedAt: input.accessedAt, createdBy: adminId, now });
  return { ...input, id, url };
}

export async function deleteCatalogSource(db: SqlClient, id: string): Promise<void> {
  await deleteCatalogSourceById(db, id);
}
