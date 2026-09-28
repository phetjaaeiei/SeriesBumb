import { CatalogError } from './catalog-delete';

export type OwnedImageEntity = 'artists' | 'labels' | 'collections';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Image keys arrive from the admin editor. Only keys inside the entity's own folder are accepted,
 * because deleting or replacing the entity later deletes whatever key is stored.
 */
export function assertEntityImageKey(entity: OwnedImageEntity, entityId: string, key: string | null | undefined): string | null {
  if (!key) return null;
  if (!UUID.test(entityId)) throw new CatalogError('รูปนี้ไม่ใช่ของรายการนี้');
  const owned = new RegExp(`^${entity}/${entityId}/[0-9a-f-]{36}-(?:full|thumb)\\.(?:jpg|webp)$`, 'iu');
  if (!owned.test(key)) throw new CatalogError('รูปนี้ไม่ใช่ของรายการนี้');
  return key;
}
