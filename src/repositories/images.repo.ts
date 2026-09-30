import { jsonParam } from '../db/client';
import type { SqlClient } from '../db/sql-client';
import type { ImageKind } from '../domain/enums';

/** The storage key of a tape image's full-size original, or null. */
export async function getTapeImageFullKey(sql: SqlClient, imageId: string | undefined): Promise<{ fullKey: string } | null> {
  return sql.prepare('SELECT fullKey FROM tape_image WHERE id = ?').bind(imageId).first<{ fullKey: string }>();
}

/** Tables that own uploaded images, and the column holding the single image of those that have one. */
export type ImageOwnerTable = 'tape' | 'artist' | 'label' | 'collection';
export type ImageOwnerKeyColumn = 'imageKey' | 'logoKey' | 'coverKey';

/** The record's id when it exists in `table`, or null. */
export async function getImageOwner(sql: SqlClient, table: ImageOwnerTable, id: string): Promise<{ id: string } | null> {
  return sql.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(id).first<{ id: string }>();
}

/** The record's current image key (from `column`) and the bytes its image uses, or null. */
export async function getOwnerImage(sql: SqlClient, table: Exclude<ImageOwnerTable, 'tape'>, column: ImageOwnerKeyColumn, id: string): Promise<{ imageKey: string | null; imageBytes: number } | null> {
  return sql.prepare(`SELECT ${column} AS imageKey, imageBytes FROM ${table} WHERE id = ?`).bind(id).first<{ imageKey: string | null; imageBytes: number }>();
}

/** Sets the record's image key and the bytes that image uses. */
export function setOwnerImageStmt(sql: SqlClient, table: Exclude<ImageOwnerTable, 'tape'>, column: ImageOwnerKeyColumn, imageKey: string, imageBytes: number, id: string): D1PreparedStatement {
  return sql.prepare(`UPDATE ${table} SET ${column} = ?, imageBytes = ? WHERE id = ?`).bind(imageKey, imageBytes, id);
}

/** The tape image already registered for this full-size key, or null. */
export async function getTapeImageIdByFullKey(sql: SqlClient, fullKey: string): Promise<{ id: string } | null> {
  return sql.prepare('SELECT id FROM tape_image WHERE fullKey = ?').bind(fullKey).first<{ id: string }>();
}

/** How many images the tape has, as a `{ value }` row. */
export async function countTapeImages(sql: SqlClient, tapeId: string): Promise<{ value: number } | null> {
  return sql.prepare('SELECT COUNT(*) AS value FROM tape_image WHERE tapeId = ?').bind(tapeId).first<{ value: number }>();
}

export interface TapeImageInsert { id: string; tapeId: string; kind: ImageKind; fullKey: string; thumbKey: string; width: number; height: number; bytes: number }

/** Adds an image after the tape's last one. */
export function insertTapeImageStmt(sql: SqlClient, image: TapeImageInsert): D1PreparedStatement {
  return sql.prepare('INSERT INTO tape_image (id, tapeId, kind, fullKey, thumbKey, width, height, bytes, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM tape_image WHERE tapeId = ?))').bind(image.id, image.tapeId, image.kind, image.fullKey, image.thumbKey, image.width, image.height, image.bytes, image.tapeId);
}

/** Points the tape's cover at its first front image (else its first image). */
export function refreshTapeCoverStmt(sql: SqlClient, tapeId: string): D1PreparedStatement {
  return sql.prepare(`UPDATE tape SET coverImageId = (SELECT id FROM tape_image WHERE tapeId = ? ORDER BY CASE WHEN kind = 'front' THEN 0 ELSE 1 END, position LIMIT 1), coverThumbKey = (SELECT thumbKey FROM tape_image WHERE tapeId = ? ORDER BY CASE WHEN kind = 'front' THEN 0 ELSE 1 END, position LIMIT 1) WHERE id = ?`).bind(tapeId, tapeId, tapeId);
}

export interface TapeImageDeleteRow { id: string; tapeId: string; fullKey: string; thumbKey: string; bytes: number; status: string; ogSourceImageId: string | null; ogImageKey: string | null; ogImageBytes: number }

/** A tape image with its tape's status and share-image fields, or null. */
export async function getTapeImageForDelete(sql: SqlClient, imageId: string): Promise<TapeImageDeleteRow | null> {
  return sql.prepare(`SELECT i.id, i.tapeId, i.fullKey, i.thumbKey, i.bytes, t.status,
    t.ogSourceImageId, t.ogImageKey, t.ogImageBytes FROM tape_image i JOIN tape t ON t.id = i.tapeId WHERE i.id = ?`)
    .bind(imageId).first<TapeImageDeleteRow>();
}

export function deleteTapeImageStmt(sql: SqlClient, imageId: string): D1PreparedStatement {
  return sql.prepare('DELETE FROM tape_image WHERE id = ?').bind(imageId);
}

/** Re-points the tape's cover after an image is removed, clearing its share image when `removeOg` is 1. */
export function refreshTapeCoverAfterImageDeleteStmt(sql: SqlClient, tapeId: string, removeOg: number): D1PreparedStatement {
  return sql.prepare(`UPDATE tape SET coverImageId = (SELECT id FROM tape_image WHERE tapeId = ? ORDER BY CASE WHEN kind = 'front' THEN 0 ELSE 1 END, position LIMIT 1),
      coverThumbKey = (SELECT thumbKey FROM tape_image WHERE tapeId = ? ORDER BY CASE WHEN kind = 'front' THEN 0 ELSE 1 END, position LIMIT 1),
      ogImageKey = CASE WHEN ? = 1 THEN NULL ELSE ogImageKey END,
      ogImageBytes = CASE WHEN ? = 1 THEN 0 ELSE ogImageBytes END,
      ogSourceTitle = CASE WHEN ? = 1 THEN NULL ELSE ogSourceTitle END
      WHERE id = ?`).bind(tapeId, tapeId, removeOg, removeOg, removeOg, tapeId);
}

export interface TapeImageSaveRow { id: string; kind: ImageKind; thumbKey: string }

/** The tape's images in display order, as saveTape reorders them and picks the cover. */
export async function listTapeImagesForSave(sql: SqlClient, tapeId: string): Promise<TapeImageSaveRow[]> {
  return (await sql.prepare('SELECT id, kind, thumbKey FROM tape_image WHERE tapeId = ? ORDER BY position, id').bind(tapeId).all<TapeImageSaveRow>()).results;
}

/** Sets each listed image's kind and position (`images` in display order, each with its position). */
export function reorderTapeImagesStmt(sql: SqlClient, tapeId: string, images: { id: string; kind: ImageKind; position: number }[]): D1PreparedStatement {
  return sql.prepare(`UPDATE tape_image SET
      kind = (SELECT json_extract(value, '$.kind') FROM json_each(?1) WHERE json_extract(value, '$.id') = tape_image.id),
      position = (SELECT CAST(json_extract(value, '$.position') AS INTEGER) FROM json_each(?1) WHERE json_extract(value, '$.id') = tape_image.id)
      WHERE tapeId = ?2 AND id IN (SELECT json_extract(value, '$.id') FROM json_each(?1))`)
    .bind(jsonParam(images), tapeId);
}

export interface TapeImageFileRow { fullKey: string; thumbKey: string; bytes: number }

/** The storage keys and bytes of every image of the tape. */
export async function listTapeImageFiles(sql: SqlClient, tapeId: string): Promise<TapeImageFileRow[]> {
  return (await sql.prepare('SELECT fullKey, thumbKey, bytes FROM tape_image WHERE tapeId = ?').bind(tapeId).all<TapeImageFileRow>()).results;
}
