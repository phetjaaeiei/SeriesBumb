import { jsonParam } from '../../db/client';
import type { ImageStore } from './image-store';

type Kind = 'tapes' | 'songs' | 'artists' | 'labels' | 'genres' | 'collections';
export class CatalogError extends Error {}

function removeIndex(db: D1Database, kind: string, id: string, path: string): D1PreparedStatement[] {
  return [
    db.prepare('DELETE FROM search_fts WHERE rowid = (SELECT docId FROM search_doc WHERE kind = ? AND refId = ?)').bind(kind, id),
    db.prepare('DELETE FROM search_doc WHERE kind = ? AND refId = ?').bind(kind, id),
    db.prepare('DELETE FROM search_queue WHERE kind = ? AND refId = ?').bind(kind, id),
    db.prepare('DELETE FROM redirect WHERE fromPath = ? OR toPath = ?').bind(path, path),
  ];
}

function thumbKeys(fullKey: string | null): string[] {
  if (!fullKey) return [];
  return [fullKey, fullKey.replace(/-full\.[^.]+$/u, '-thumb.webp'), fullKey.replace(/-full\.[^.]+$/u, '-thumb.jpg')];
}

export async function deleteCatalogEntity(db: D1Database, bucket: ImageStore, kind: Kind, id: string, confirmation: string | undefined, waitUntil: (promise: Promise<unknown>) => void) {
  if (kind === 'tapes') {
    const tape = await db.prepare('SELECT id, title, slug, status, labelId, ogImageKey, ogImageBytes FROM tape WHERE id = ?').bind(id).first<{ id: string; title: string; slug: string; status: string; labelId: string | null; ogImageKey: string | null; ogImageBytes: number }>();
    if (!tape) throw new CatalogError('ไม่พบเทปนี้');
    if (confirmation !== tape.title) throw new CatalogError('กรุณาพิมพ์ชื่อเทปให้ตรงก่อนลบ');
    const [artists, genres, songs, images] = await Promise.all([
      db.prepare('SELECT artistId AS id FROM tape_artist WHERE tapeId = ?').bind(id).all<{ id: string }>(),
      db.prepare('SELECT genreId AS id FROM tape_genre WHERE tapeId = ?').bind(id).all<{ id: string }>(),
      db.prepare('SELECT songId AS id FROM tape_track WHERE tapeId = ?').bind(id).all<{ id: string }>(),
      db.prepare('SELECT fullKey, thumbKey, bytes FROM tape_image WHERE tapeId = ?').bind(id).all<{ fullKey: string; thumbKey: string; bytes: number }>(),
    ]);
    const songIds = [...new Set(songs.results.map(row => row.id))];
    const singerRows = songIds.length ? (await db.prepare('SELECT DISTINCT artistId AS id FROM song_artist WHERE songId IN (SELECT value FROM json_each(?))').bind(jsonParam(songIds)).all<{ id: string }>()).results : [];
    const artistIds = [...new Set([...artists.results.map(row => row.id), ...singerRows.map(row => row.id)])];
    const genreIds = genres.results.map(row => row.id);
    const bytes = images.results.reduce((sum, image) => sum + image.bytes, tape.ogImageBytes);
    const now = Date.now();
    const statements: D1PreparedStatement[] = [
      ...removeIndex(db, 'tape', id, `/tapes/${tape.slug}`),
      db.prepare('DELETE FROM tape WHERE id = ?').bind(id),
      db.prepare('UPDATE site_stats SET tapeCount = MAX(0, tapeCount - 1), publishedTapeCount = MAX(0, publishedTapeCount - ?), imageBytes = MAX(0, imageBytes - ?), updatedAt = ? WHERE id = 1').bind(Number(tape.status === 'published'), bytes, now),
    ];
    if (songIds.length) {
      statements.push(db.prepare("UPDATE song SET publishedTapeCount = (SELECT COUNT(DISTINCT t.id) FROM tape_track tt JOIN tape t ON t.id = tt.tapeId WHERE tt.songId = song.id AND t.status = 'published') WHERE id IN (SELECT value FROM json_each(?))").bind(jsonParam(songIds)));
      statements.push(db.prepare("UPDATE search_doc SET isPublic = (SELECT CASE WHEN publishedTapeCount > 0 THEN 1 ELSE 0 END FROM song WHERE id = search_doc.refId) WHERE kind = 'song' AND refId IN (SELECT value FROM json_each(?))").bind(jsonParam(songIds)));
    }
    if (artistIds.length) {
      statements.push(db.prepare(`UPDATE artist SET publishedTapeCount = (SELECT COUNT(DISTINCT tapeId) FROM (SELECT ta.tapeId FROM tape_artist ta JOIN tape t ON t.id = ta.tapeId WHERE ta.artistId = artist.id AND t.status = 'published' UNION SELECT tt.tapeId FROM song_artist sa JOIN tape_track tt ON tt.songId = sa.songId JOIN tape t ON t.id = tt.tapeId WHERE sa.artistId = artist.id AND t.status = 'published')) WHERE id IN (SELECT value FROM json_each(?))`).bind(jsonParam(artistIds)));
      statements.push(db.prepare("UPDATE search_doc SET isPublic = (SELECT CASE WHEN publishedTapeCount > 0 THEN 1 ELSE 0 END FROM artist WHERE id = search_doc.refId) WHERE kind = 'artist' AND refId IN (SELECT value FROM json_each(?))").bind(jsonParam(artistIds)));
    }
    if (genreIds.length) statements.push(db.prepare('UPDATE genre SET publishedTapeCount = (SELECT COUNT(*) FROM tape_genre WHERE genreId = genre.id AND isPublished = 1) WHERE id IN (SELECT value FROM json_each(?))').bind(jsonParam(genreIds)));
    if (tape.labelId) {
      statements.push(db.prepare("UPDATE label SET publishedTapeCount = (SELECT COUNT(*) FROM tape WHERE labelId = ? AND status = 'published') WHERE id = ?").bind(tape.labelId, tape.labelId));
      statements.push(db.prepare("UPDATE search_doc SET isPublic = (SELECT CASE WHEN publishedTapeCount > 0 THEN 1 ELSE 0 END FROM label WHERE id = ?) WHERE kind = 'label' AND refId = ?").bind(tape.labelId, tape.labelId));
    }
    await db.batch(statements);
    const keys = [...images.results.flatMap(image => [image.fullKey, image.thumbKey]), ...(tape.ogImageKey ? [tape.ogImageKey] : [])];
    if (keys.length) waitUntil(bucket.delete(keys));
    return { id, kind };
  }

  if (kind === 'songs') {
    const song = await db.prepare('SELECT slug FROM song WHERE id = ?').bind(id).first<{ slug: string }>();
    if (!song) throw new CatalogError('ไม่พบเพลงนี้');
    const linked = await db.prepare('SELECT t.title FROM tape_track tt JOIN tape t ON t.id = tt.tapeId WHERE tt.songId = ? LIMIT 3').bind(id).all<{ title: string }>();
    if (linked.results.length) throw new CatalogError(`เพลงนี้ยังอยู่ในเทป: ${linked.results.map(row => row.title).join(', ')}`);
    await db.batch([...removeIndex(db, 'song', id, `/songs/${song.slug}`), db.prepare('DELETE FROM song WHERE id = ?').bind(id), db.prepare('UPDATE site_stats SET songCount = MAX(0, songCount - 1), updatedAt = ? WHERE id = 1').bind(Date.now())]);
    return { id, kind };
  }

  if (kind === 'genres') {
    const genre = await db.prepare('SELECT slug FROM genre WHERE id = ?').bind(id).first<{ slug: string }>();
    if (!genre) throw new CatalogError('ไม่พบแนวเพลงนี้');
    const linked = await db.prepare('SELECT COUNT(*) AS count FROM tape_genre WHERE genreId = ?').bind(id).first<{ count: number }>();
    if (linked?.count) throw new CatalogError(`แนวเพลงนี้ยังผูกกับเทป ${linked.count} ชุด`);
    await db.batch([db.prepare('DELETE FROM genre WHERE id = ?').bind(id), db.prepare('DELETE FROM redirect WHERE fromPath = ? OR toPath = ?').bind(`/genres/${genre.slug}`, `/genres/${genre.slug}`)]);
    return { id, kind };
  }

  if (kind === 'artists' || kind === 'labels') {
    const table = kind === 'artists' ? 'artist' : 'label';
    const imageColumn = kind === 'artists' ? 'imageKey' : 'logoKey';
    const row = await db.prepare(`SELECT slug, ${imageColumn} AS imageKey, imageBytes FROM ${table} WHERE id = ?`).bind(id).first<{ slug: string; imageKey: string | null; imageBytes: number }>();
    if (!row) throw new CatalogError(kind === 'artists' ? 'ไม่พบศิลปินนี้' : 'ไม่พบค่ายนี้');
    const linked = kind === 'artists'
      ? await db.prepare('SELECT (SELECT COUNT(*) FROM tape_artist WHERE artistId = ?) + (SELECT COUNT(*) FROM song_artist WHERE artistId = ?) AS count').bind(id, id).first<{ count: number }>()
      : await db.prepare('SELECT COUNT(*) AS count FROM tape WHERE labelId = ?').bind(id).first<{ count: number }>();
    if (linked?.count) throw new CatalogError(`รายการนี้ยังผูกกับข้อมูลอื่น ${linked.count} รายการ`);
    await db.batch([...removeIndex(db, kind === 'artists' ? 'artist' : 'label', id, `/${kind}/${row.slug}`), db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id), db.prepare('UPDATE site_stats SET imageBytes = MAX(0, imageBytes - ?), updatedAt = ? WHERE id = 1').bind(row.imageBytes, Date.now())]);
    if (row.imageKey) waitUntil(bucket.delete(thumbKeys(row.imageKey)));
    return { id, kind };
  }

  const collection = await db.prepare('SELECT slug, coverKey, imageBytes FROM collection WHERE id = ?').bind(id).first<{ slug: string; coverKey: string | null; imageBytes: number }>();
  if (!collection) throw new CatalogError('ไม่พบ Collection นี้');
  await db.batch([...removeIndex(db, 'collection', id, `/collections/${collection.slug}`), db.prepare('DELETE FROM collection WHERE id = ?').bind(id), db.prepare('UPDATE site_stats SET imageBytes = MAX(0, imageBytes - ?), updatedAt = ? WHERE id = 1').bind(collection.imageBytes, Date.now())]);
  if (collection.coverKey) waitUntil(bucket.delete(thumbKeys(collection.coverKey)));
  return { id, kind };
}
