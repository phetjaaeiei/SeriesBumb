import type { SqlClient } from '../db/sql-client';
import { getRecordId } from '../repositories/admin.repo';
import {
  countTapeEditions, deleteArtistRelationById, deleteTapeEditionById, insertArtistRelation, insertTapeEdition, type EditionFormat, type RelationType,
} from '../repositories/relations.repo';
import { getCatalogSourceIdFor } from '../repositories/sources.repo';

export type { EditionFormat, RelationType } from '../repositories/relations.repo';

async function assertSource(db: SqlClient, sourceId: string, kind: 'artist' | 'tape', entityId: string) {
  const source = await getCatalogSourceIdFor(db, sourceId, kind, entityId);
  if (!source) throw new Error('แหล่งอ้างอิงต้องอยู่ในรายการต้นทาง');
}

export async function addArtistRelation(db: SqlClient, artistId: string, relatedArtistId: string, relationType: RelationType, sourceId: string) {
  if (artistId === relatedArtistId) throw new Error('ศิลปินต้นทางและปลายทางต้องต่างกัน');
  await assertSource(db, sourceId, 'artist', artistId);
  const related = await getRecordId(db, 'artist', relatedArtistId);
  if (!related) throw new Error('ไม่พบศิลปินที่เชื่อม');
  const id = crypto.randomUUID();
  await insertArtistRelation(db, { id, artistId, relatedArtistId, relationType, sourceId, now: Date.now() });
  return { id };
}

export async function addTapeEdition(db: SqlClient, tapeId: string, relatedTapeId: string, format: EditionFormat, editionYear: number | null, note: string, sourceId: string) {
  if (tapeId === relatedTapeId) throw new Error('เทปต้นทางและฉบับอื่นต้องต่างกัน');
  await assertSource(db, sourceId, 'tape', tapeId);
  const related = await getRecordId(db, 'tape', relatedTapeId);
  if (!related) throw new Error('ไม่พบฉบับที่เชื่อม');
  const count = await countTapeEditions(db, tapeId);
  if ((count?.value ?? 0) >= 50) throw new Error('เชื่อมฉบับได้ไม่เกิน 50 รายการ');
  const id = crypto.randomUUID();
  await insertTapeEdition(db, { id, tapeId, relatedTapeId, format, editionYear, note: note.trim(), sourceId, now: Date.now() });
  return { id };
}

export async function deleteArtistRelation(db: SqlClient, id: string) { await deleteArtistRelationById(db, id); }
export async function deleteTapeEdition(db: SqlClient, id: string) { await deleteTapeEditionById(db, id); }
