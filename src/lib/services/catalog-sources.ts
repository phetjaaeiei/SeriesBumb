export type SourceKind = 'artist' | 'tape';
export interface CatalogSource { id: string; entityKind: SourceKind; entityId: string; title: string; url: string; claim: string; accessedAt: number }

export function validateSourceUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port || /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/iu.test(url.hostname)) throw new Error('แหล่งอ้างอิงต้องเป็นลิงก์ https สาธารณะ');
  return url.href;
}

export async function listCatalogSources(db: D1Database, entityKind: SourceKind, entityId: string): Promise<CatalogSource[]> {
  return (await db.prepare('SELECT id, entityKind, entityId, title, url, claim, accessedAt FROM catalog_source WHERE entityKind = ? AND entityId = ? ORDER BY createdAt DESC LIMIT 50')
    .bind(entityKind, entityId).all<CatalogSource>()).results;
}

export async function addCatalogSource(db: D1Database, adminId: string, input: Omit<CatalogSource, 'id'>): Promise<CatalogSource> {
  const table = input.entityKind === 'artist' ? 'artist' : 'tape';
  const exists = await db.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(input.entityId).first();
  if (!exists) throw new Error('ไม่พบรายการที่อ้างอิง');
  const url = validateSourceUrl(input.url);
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.prepare('INSERT INTO catalog_source (id, entityKind, entityId, title, url, claim, accessedAt, createdBy, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, input.entityKind, input.entityId, input.title.trim(), url, input.claim.trim(), input.accessedAt, adminId, now).run();
  return { ...input, id, url };
}

export async function deleteCatalogSource(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM catalog_source WHERE id = ?').bind(id).run();
}
