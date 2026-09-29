import type { SqlClient } from '../db/sql-client';
import type { ImageStore } from '../storage/image-store';
import { IMAGE_STORAGE_LIMIT } from '../storage/supabase-image-store';
import { runBatch } from '../repositories/batch.repo';
import {
  countTapeImages, deleteTapeImageStmt, getImageOwner, getOwnerImage, getTapeImageForDelete, getTapeImageIdByFullKey, insertTapeImageStmt,
  refreshTapeCoverAfterImageDeleteStmt, refreshTapeCoverStmt, setOwnerImageStmt, type ImageOwnerKeyColumn, type ImageOwnerTable,
} from '../repositories/images.repo';
import { addImageBytesStmt, getImageBytesRow, subtractImageBytesStmt } from '../repositories/stats.repo';

export type ImageEntityType = 'tapes' | 'artists' | 'labels' | 'collections';
export type ImageVariant = 'full' | 'thumb' | 'og';
export type ImageKind = 'front' | 'back' | 'inside' | 'cassette' | 'other';

export function assertImageBudget(usedBytes: number, projectedBytes: number): void {
  if (!Number.isSafeInteger(usedBytes) || usedBytes < 0 || !Number.isSafeInteger(projectedBytes) || projectedBytes < 0
    || usedBytes + projectedBytes > IMAGE_STORAGE_LIMIT) {
    throw new Error('พื้นที่รูปของเว็บใกล้เต็ม 50 MB กรุณาลบรูปเก่าก่อน');
  }
}

export function sniffImage(bytes: Uint8Array): { extension: 'jpg' | 'webp'; contentType: 'image/jpeg' | 'image/webp' } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { extension: 'jpg', contentType: 'image/jpeg' };
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return { extension: 'webp', contentType: 'image/webp' };
  return null;
}

const tableForEntity = { tapes: 'tape', artists: 'artist', labels: 'label', collections: 'collection' } as const satisfies Record<ImageEntityType, ImageOwnerTable>;
const keyColumnForEntity = { artists: 'imageKey', labels: 'logoKey', collections: 'coverKey' } as const satisfies Record<Exclude<ImageEntityType, 'tapes'>, ImageOwnerKeyColumn>;

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

export async function uploadImage(db: SqlClient, bucket: ImageStore, input: UploadInput) {
  const { entityType, entityId, variant, file } = input;
  if (file.size < 1 || file.size > 3_000_000) throw new Error('รูปต้องมีขนาดไม่เกิน 3 MB');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = sniffImage(bytes);
  if (!format) throw new Error('รับเฉพาะรูป JPEG หรือ WebP');
  if (variant === 'og' && (entityType !== 'tapes' || format.extension !== 'jpg')) throw new Error('รูปแชร์ต้องเป็น JPEG ของเทป');
  const exists = await getImageOwner(db, tableForEntity[entityType], entityId);
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
  const usage = await getImageBytesRow(db);
  const projectedBytes = variant === 'full' ? file.size + 3_000_000 : variant === 'thumb' ? full!.size + file.size : file.size;
  if (!usage) throw new Error('อ่านข้อมูลพื้นที่รูปไม่สำเร็จ');
  assertImageBudget(usage.imageBytes, projectedBytes);
  await bucket.put(key, bytes, { httpMetadata: { contentType: format.contentType } });

  if (variant === 'thumb' && full) {
    const combinedBytes = full.size + file.size;
    if (entityType === 'tapes') {
      const existing = await getTapeImageIdByFullKey(db, fullKey);
      if (existing) throw new Error('รูปนี้เพิ่มในเทปแล้ว');
      const count = await countTapeImages(db, entityId);
      if ((count?.value ?? 0) >= 40) throw new Error('เทปหนึ่งชุดมีรูปได้ไม่เกิน 40 รูป');
      const id = crypto.randomUUID();
      const kind = input.kind || 'front';
      await runBatch(db, [
        insertTapeImageStmt(db, { id, tapeId: entityId, kind, fullKey, thumbKey: key, width: input.width!, height: input.height!, bytes: combinedBytes }),
        refreshTapeCoverStmt(db, entityId),
        addImageBytesStmt(db, combinedBytes, Date.now()),
      ]);
      return { uuid, key, fullKey, thumbKey: key, imageId: id };
    }
    const table = tableForEntity[entityType];
    const column = keyColumnForEntity[entityType];
    const old = await getOwnerImage(db, table, column, entityId);
    await runBatch(db, [
      setOwnerImageStmt(db, table, column, fullKey, combinedBytes, entityId),
      addImageBytesStmt(db, combinedBytes - (old?.imageBytes ?? 0), Date.now()),
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

export async function deleteTapeImage(db: SqlClient, bucket: ImageStore, imageId: string, waitUntil: (promise: Promise<unknown>) => void) {
  const image = await getTapeImageForDelete(db, imageId);
  if (!image) throw new Error('ไม่พบรูปนี้');
  const count = await countTapeImages(db, image.tapeId);
  if (image.status === 'published' && (count?.value ?? 0) < 2) throw new Error('เทปที่เผยแพร่ต้องมีรูปปกอย่างน้อยหนึ่งรูป');
  const removeOg = image.ogSourceImageId === imageId && !!image.ogImageKey;
  await runBatch(db, [
    deleteTapeImageStmt(db, imageId),
    refreshTapeCoverAfterImageDeleteStmt(db, image.tapeId, Number(removeOg)),
    subtractImageBytesStmt(db, image.bytes + (removeOg ? image.ogImageBytes : 0), Date.now()),
  ]);
  const keys = [image.fullKey, image.thumbKey, ...(removeOg && image.ogImageKey ? [image.ogImageKey] : [])];
  waitUntil(bucket.delete(keys));
  return { tapeId: image.tapeId };
}
