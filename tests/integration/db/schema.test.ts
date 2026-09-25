import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const db = env.DB;
const now = Date.now();

describe('database migrations', () => {
  it('creates the catalogue, auth, search tables and single site statistics row', async () => {
    const result = await db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all<{ name: string }>();
    const names = new Set(result.results.map((row) => row.name));

    for (const name of ['user', 'session', 'account', 'verification', 'artist', 'label', 'genre', 'tape', 'song', 'collection', 'comment', 'search_doc', 'search_queue', 'search_fts', 'redirect', 'site_stats']) {
      expect(names.has(name), `${name} table is missing`).toBe(true);
    }

    const stats = await db.prepare('SELECT id, tapeCount, publishedTapeCount, songCount, userCount, imageBytes FROM site_stats').first();
    expect(stats).toEqual({ id: 1, tapeCount: 0, publishedTapeCount: 0, songCount: 0, userCount: 0, imageBytes: 0 });
  });

  it('enforces tape image nullification, song restrict, and tape cascade', async () => {
    const tapeId = crypto.randomUUID();
    const songId = crypto.randomUUID();
    const imageId = crypto.randomUUID();

    await db.prepare('INSERT INTO tape (id, slug, title, titleSort, releaseType, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(tapeId, `tape-${tapeId}`, 'เทปทดสอบ', '1ทดสอบ', 'album', now, now).run();
    await db.prepare('INSERT INTO song (id, slug, title, titleSort, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(songId, `song-${songId}`, 'เพลงทดสอบ', '1ทดสอบ', now, now).run();
    await db.prepare('INSERT INTO tape_image (id, tapeId, kind, fullKey, thumbKey, width, height, bytes, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(imageId, tapeId, 'front', 'test-full.jpg', 'test-thumb.jpg', 100, 100, 10, 0).run();
    await db.prepare('UPDATE tape SET coverImageId = ?, ogSourceImageId = ? WHERE id = ?')
      .bind(imageId, imageId, tapeId).run();
    await db.prepare('DELETE FROM tape_image WHERE id = ?').bind(imageId).run();
    const cover = await db.prepare('SELECT coverImageId, ogSourceImageId FROM tape WHERE id = ?').bind(tapeId).first();
    expect(cover).toEqual({ coverImageId: null, ogSourceImageId: null });

    await db.prepare('INSERT INTO tape_track (id, tapeId, songId, side, position) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), tapeId, songId, 'A', 1).run();
    await expect(db.prepare('DELETE FROM song WHERE id = ?').bind(songId).run()).rejects.toThrow();
    await db.prepare('DELETE FROM tape WHERE id = ?').bind(tapeId).run();
    expect(await db.prepare('SELECT COUNT(*) AS n FROM tape_track WHERE tapeId = ?').bind(tapeId).first<{ n: number }>()).toEqual({ n: 0 });
    expect(await db.prepare('SELECT id FROM song WHERE id = ?').bind(songId).first()).toEqual({ id: songId });
  });

  it('rejects comments that target zero or two entities', async () => {
    const userId = crypto.randomUUID();
    const tapeId = crypto.randomUUID();
    const songId = crypto.randomUUID();
    await db.prepare('INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, 'ทดสอบ', `${userId}@example.test`, now, now).run();
    await db.prepare('INSERT INTO tape (id, slug, title, titleSort, releaseType, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(tapeId, `tape-${tapeId}`, 'เทปทดสอบ', '1ทดสอบ', 'album', now, now).run();
    await db.prepare('INSERT INTO song (id, slug, title, titleSort, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(songId, `song-${songId}`, 'เพลงทดสอบ', '1ทดสอบ', now, now).run();

    const insert = 'INSERT INTO comment (id, userId, tapeId, songId, body, createdAt) VALUES (?, ?, ?, ?, ?, ?)';
    await expect(db.prepare(insert).bind(crypto.randomUUID(), userId, null, null, 'ข้อความ', now).run()).rejects.toThrow();
    await expect(db.prepare(insert).bind(crypto.randomUUID(), userId, tapeId, songId, 'ข้อความ', now).run()).rejects.toThrow();
    await db.prepare(insert).bind(crypto.randomUUID(), userId, tapeId, null, 'ข้อความ', now).run();
  });

  it('supports trigram full-text search using search_doc rowids', async () => {
    const refId = crypto.randomUUID();
    await db.prepare('INSERT INTO search_doc (kind, refId, isPublic, nameKey) VALUES (?, ?, ?, ?)')
      .bind('tape', refId, 1, 'seriesbumb').run();
    const doc = await db.prepare('SELECT docId FROM search_doc WHERE kind = ? AND refId = ?')
      .bind('tape', refId).first<{ docId: number }>();
    expect(doc).not.toBeNull();
    await db.prepare('INSERT INTO search_fts (rowid, text) VALUES (?, ?)')
      .bind(doc!.docId, 'seriesbumb archive').run();

    const match = await db.prepare('SELECT rowid FROM search_fts WHERE search_fts MATCH ?')
      .bind('"seriesbumb"').first<{ rowid: number }>();
    expect(match?.rowid).toBe(doc!.docId);
  });
});
