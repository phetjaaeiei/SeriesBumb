import type { ImageStore } from './image-store';

export type ImageEntityType = 'tapes' | 'artists' | 'labels' | 'collections';
export type ImageVariant = 'full' | 'thumb' | 'og';
export type ImageKind = 'front' | 'back' | 'inside' | 'cassette' | 'other';

export function sniffImage(bytes: Uint8Array): { extension: 'jpg' | 'webp'; contentType: 'image/jpeg' | 'image/webp' } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: 'jpg', contentType: 'image/jpeg' };
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return { extension: 'webp', contentType: 'image/webp' };
  return null;
}

const tableForEntity = { tapes: 'tape', artists: 'artist', labels: 'label', collections: 'collection' } as const;
const keyColumnForEntity = { artists: 'imageKey', labels: 'logoKey', collections: 'coverKey' } as const;

export interface UploadInput {
  entityType: ImageEntityType;
  entityId: string;
  variant: ImageVariant;
  uuid?: string;
  kind?: ImageKind;
  width?: number;
  height?: number;
  file: File;
}

export async function uploadImage(db: D1Database, bucket: ImageStore, input: UploadInput) {
  const { entityType, entityId, variant, file } = input;
  if (file.size < 1 || file.size > 3 * 1024 * 1024) throw new Error('รูปต้องมีขนาดไม่เกิน 3 MB');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = sniffImage(bytes);
  if (!format) throw new Error('รับเฉพาะรูป JPEG หรือ WebP');
  if (variant === 'og' && (entityType !== 'tapes' || format.extension !== 'jpg')) throw new Error('รูปแชร์ต้องเป็น JPEG ของเทป');
  const exists = await db.prepare(`SELECT id FROM ${tableForEntity[entityType]} WHERE id = ?`).bind(entityId).first<{ id: string }>();
  if (!exists) throw new Error('ไม่พบรายการที่จะเพิ่มรูป');
  const uuid = input.uuid || crypto.randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(uuid)) throw new Error('รหัสรูปไม่ถูกต้อง');
  if (variant === 'thumb' && !input.uuid) throw new Error('ต้องอัปโหลดรูปเต็มก่อน');
  if (variant === 'thumb' && (!input.width || !input.height || input.width < 1 || input.height < 1)) throw new Error('ขนาดรูปไม่ถูกต้อง');
  const key = `${entityType}/${entityId}/${uuid}-${variant}.${format.extension}`;
  let full: { size: number } | null = null;
  let fullKey = '';
  if (variant === 'thumb') {
    for (const extension of ['jpg', 'webp'] as const) {
      const candidate = `${entityType}/${entityId}/${uuid}-full.${extension}`;
      const object = await bucket.head(candidate);
      if (object) { full = object; fullKey = candidate; break; }
    }
    if (!full) throw new Error('ไม่พบรูปเต็มที่คู่กัน');
  }
  await bucket.put(key, bytes, { httpMetadata: { contentType: format.contentType } });

  if (variant === 'thumb' && full) {
    const combinedBytes = full.size + file.size;
    if (entityType === 'tapes') {
      const existing = await db.prepare('SELECT id FROM tape_image WHERE fullKey = ?').bind(fullKey).first<{ id: string }>();
      if (existing) throw new Error('รูปนี้เพิ่มในเทปแล้ว');
      const count = await db.prepare('SELECT COUNT(*) AS value FROM tape_image WHERE tapeId = ?').bind(entityId).first<{ value: number }>();
      if ((count?.value ?? 0) >= 40) throw new Error('เทปหนึ่งชุดมีรูปได้ไม่เกิน 40 รูป');
      const id = crypto.randomUUID();
      const kind = input.kind || 'front';
      await db.batch([
        db.prepare('INSERT INTO tape_image (id, tapeId, kind, fullKey, thumbKey, width, height, bytes, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM tape_image WHERE tapeId = ?))').bind(id, entityId, kind, fullKey, key, input.width!, input.height!, combinedBytes, entityId),
        db.prepare(`UPDATE tape SET coverImageId = (SELECT id FROM tape_image WHERE tapeId = ? ORDER BY CASE WHEN kind = 'front' THEN 0 ELSE 1 END, position LIMIT 1), coverThumbKey = (SELECT thumbKey FROM tape_image WHERE tapeId = ? ORDER BY CASE WHEN kind = 'front' THEN 0 ELSE 1 END, position LIMIT 1) WHERE id = ?`).bind(entityId, entityId, entityId),
        db.prepare('UPDATE site_stats SET imageBytes = imageBytes + ?, updatedAt = ? WHERE id = 1').bind(combinedBytes, Date.now()),
      ]);
      return { uuid, key, fullKey, thumbKey: key, imageId: id };
    }
    const table = tableForEntity[entityType];
    const column = keyColumnForEntity[entityType];
    const old = await db.prepare(`SELECT ${column} AS imageKey, imageBytes FROM ${table} WHERE id = ?`).bind(entityId).first<{ imageKey: string | null; imageBytes: number }>();
    await db.batch([
      db.prepare(`UPDATE ${table} SET ${column} = ?, imageBytes = ? WHERE id = ?`).bind(fullKey, combinedBytes, entityId),
      db.prepare('UPDATE site_stats SET imageBytes = imageBytes + ?, updatedAt = ? WHERE id = 1').bind(combinedBytes - (old?.imageBytes ?? 0), Date.now()),
    ]);
    if (old?.imageKey && old.imageKey !== fullKey) {
      try { await bucket.delete([old.imageKey, old.imageKey.replace(/-full\.[^.]+$/u, '-thumb.webp'), old.imageKey.replace(/-full\.[^.]+$/u, '-thumb.jpg')]); }
      catch { console.error('Unable to remove replaced image'); }
    }
    return { uuid, key, fullKey, thumbKey: key };
  }

  // OG uploads are attached by saveTape in the same batch as the title and cover.
  return { uuid, key };
}

export async function deleteTapeImage(db: D1Database, bucket: ImageStore, imageId: string, waitUntil: (promise: Promise<unknown>) => void) {
  const image = await db.prepare(`SELECT i.id, i.tapeId, i.fullKey, i.thumbKey, i.bytes, t.status,
    t.ogSourceImageId, t.ogImageKey, t.ogImageBytes FROM tape_image i JOIN tape t ON t.id = i.tapeId WHERE i.id = ?`)
    .bind(imageId).first<{ id: string; tapeId: string; fullKey: string; thumbKey: string; bytes: number; status: string; ogSourceImageId: string | null; ogImageKey: string | null; ogImageBytes: number }>();
  if (!image) throw new Error('ไม่พบรูปนี้');
  const count = await db.prepare('SELECT COUNT(*) AS value FROM tape_image WHERE tapeId = ?').bind(image.tapeId).first<{ value: number }>();
  if (image.status === 'published' && (count?.value ?? 0) < 2) throw new Error('เทปที่เผยแพร่ต้องมีรูปปกอย่างน้อยหนึ่งรูป');
  const removeOg = image.ogSourceImageId === imageId && !!image.ogImageKey;
  await db.batch([
    db.prepare('DELETE FROM tape_image WHERE id = ?').bind(imageId),
    db.prepare(`UPDATE tape SET coverImageId = (SELECT id FROM tape_image WHERE tapeId = ? ORDER BY CASE WHEN kind = 'front' THEN 0 ELSE 1 END, position LIMIT 1),
      coverThumbKey = (SELECT thumbKey FROM tape_image WHERE tapeId = ? ORDER BY CASE WHEN kind = 'front' THEN 0 ELSE 1 END, position LIMIT 1),
      ogImageKey = CASE WHEN ? = 1 THEN NULL ELSE ogImageKey END,
      ogImageBytes = CASE WHEN ? = 1 THEN 0 ELSE ogImageBytes END,
      ogSourceTitle = CASE WHEN ? = 1 THEN NULL ELSE ogSourceTitle END
      WHERE id = ?`).bind(image.tapeId, image.tapeId, Number(removeOg), Number(removeOg), Number(removeOg), image.tapeId),
    db.prepare('UPDATE site_stats SET imageBytes = MAX(0, imageBytes - ?), updatedAt = ? WHERE id = 1').bind(image.bytes + (removeOg ? image.ogImageBytes : 0), Date.now()),
  ]);
  const keys = [image.fullKey, image.thumbKey, ...(removeOg && image.ogImageKey ? [image.ogImageKey] : [])];
  waitUntil(bucket.delete(keys));
  return { tapeId: image.tapeId };
}
