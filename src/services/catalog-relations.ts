import type { SqlClient } from '../db/sql-client';

export type RelationType = 'former_name' | 'collaboration' | 'related';
export type EditionFormat = 'cassette' | 'cd' | 'digital' | 'other';

async function assertSource(db: D1Database, sourceId: string, kind: 'artist' | 'tape', entityId: string) {
  const source = await db.prepare('SELECT id FROM catalog_source WHERE id = ? AND entityKind = ? AND entityId = ?').bind(sourceId, kind, entityId).first();
  if (!source) throw new Error('แหล่งอ้างอิงต้องอยู่ในรายการต้นทาง');
}

export async function addArtistRelation(db: D1Database, artistId: string, relatedArtistId: string, relationType: RelationType, sourceId: string) {
  if (artistId === relatedArtistId) throw new Error('ศิลปินต้นทางและปลายทางต้องต่างกัน');
  await assertSource(db, sourceId, 'artist', artistId);
  const related = await db.prepare('SELECT id FROM artist WHERE id = ?').bind(relatedArtistId).first();
  if (!related) throw new Error('ไม่พบศิลปินที่เชื่อม');
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO artist_relation (id, artistId, relatedArtistId, relationType, sourceId, createdAt) VALUES (?, ?, ?, ?, ?, ?)').bind(id, artistId, relatedArtistId, relationType, sourceId, Date.now()).run();
  return { id };
}

export async function addTapeEdition(db: D1Database, tapeId: string, relatedTapeId: string, format: EditionFormat, editionYear: number | null, note: string, sourceId: string) {
  if (tapeId === relatedTapeId) throw new Error('เทปต้นทางและฉบับอื่นต้องต่างกัน');
  await assertSource(db, sourceId, 'tape', tapeId);
  const related = await db.prepare('SELECT id FROM tape WHERE id = ?').bind(relatedTapeId).first();
  if (!related) throw new Error('ไม่พบฉบับที่เชื่อม');
  const count = await db.prepare('SELECT COUNT(*) AS value FROM tape_edition WHERE tapeId = ?').bind(tapeId).first<{ value: number }>();
  if ((count?.value ?? 0) >= 50) throw new Error('เชื่อมฉบับได้ไม่เกิน 50 รายการ');
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO tape_edition (id, tapeId, relatedTapeId, format, editionYear, note, sourceId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, tapeId, relatedTapeId, format, editionYear, note.trim(), sourceId, Date.now()).run();
  return { id };
}

export async function deleteArtistRelation(db: D1Database, id: string) { await db.prepare('DELETE FROM artist_relation WHERE id = ?').bind(id).run(); }
export async function deleteTapeEdition(db: D1Database, id: string) { await db.prepare('DELETE FROM tape_edition WHERE id = ?').bind(id).run(); }

export async function publicArtistRelations(db: SqlClient, artistId: string) {
  return (await db.prepare(`SELECT ar.relationType, a.slug, a.name, cs.title AS sourceTitle, cs.url AS sourceUrl FROM artist_relation ar
    JOIN artist a ON a.id = ar.relatedArtistId JOIN catalog_source cs ON cs.id = ar.sourceId
    WHERE ar.artistId = ? AND (a.publishedTapeCount > 0 OR EXISTS (SELECT 1 FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = a.id AND s.isPublic = 1))
    ORDER BY a.nameSort LIMIT 50`).bind(artistId).all<{ relationType: RelationType; slug: string; name: string; sourceTitle: string; sourceUrl: string }>()).results;
}

export async function publicTapeEditions(db: SqlClient, tapeId: string) {
  return (await db.prepare(`SELECT te.format, te.editionYear, te.note, t.slug, t.title, cs.title AS sourceTitle, cs.url AS sourceUrl FROM tape_edition te
    JOIN tape t ON t.id = te.relatedTapeId JOIN catalog_source cs ON cs.id = te.sourceId
    WHERE te.tapeId = ? AND t.status = 'published' ORDER BY te.editionYear, t.titleSort LIMIT 50`).bind(tapeId).all<{ format: EditionFormat; editionYear: number | null; note: string; slug: string; title: string; sourceTitle: string; sourceUrl: string }>()).results;
}
