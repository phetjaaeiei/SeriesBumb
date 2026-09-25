import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createArtist, createGenre, createLabel, createSong, createTapeDraft, saveTape } from '../../src/lib/services/catalog';
import { getTapeBySlug } from '../../src/lib/queries/tapes';
import { searchPublic } from '../../src/lib/search';

const db = env.DB;

describe('catalog save and publish', () => {
  it('keeps draft hidden, then publishes tape and updates related visibility together', async () => {
    const userId = crypto.randomUUID();
    const now = Date.now();
    await db.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').bind(userId, 'แอดมินทดสอบ', `${userId}@example.com`, now, now).run();
    const marker = userId.slice(0, 8);
    const artist = await createArtist(db, userId, `ศิลปิน ${marker}`);
    const label = await createLabel(db, userId, `ค่าย ${marker}`);
    const genre = await createGenre(db, `แนว ${marker}`);
    const song = await createSong(db, userId, { title: `เพลง ${marker}`, artistIds: [artist.id] });
    const tape = await createTapeDraft(db, userId, `เทป ${marker}`);
    expect(await getTapeBySlug(db, tape.slug)).toBeNull();

    await db.prepare("INSERT INTO tape_image (id, tapeId, kind, fullKey, thumbKey, width, height, bytes, position) VALUES (?, ?, 'front', ?, ?, 1200, 1200, 100, 0)")
      .bind(crypto.randomUUID(), tape.id, `tapes/${tape.id}/front-full.webp`, `tapes/${tape.id}/front-thumb.webp`).run();
    const saved = await saveTape(db, userId, {
      id: tape.id, title: `เทป ${marker}`, releaseType: 'album', year: 2541,
      artistIds: [artist.id], genreIds: [genre.id], labelId: label.id,
      tracks: [{ songId: song.id, side: 'A', position: 1 }], status: 'published',
    });
    expect(saved.status).toBe('published');
    expect((await getTapeBySlug(db, saved.slug))?.tracks[0]?.songId).toBe(song.id);
    const count = await db.prepare('SELECT publishedTapeCount FROM artist WHERE id = ?').bind(artist.id).first<{ publishedTapeCount: number }>();
    expect(count?.publishedTapeCount).toBe(1);
    const songCount = await db.prepare('SELECT publishedTapeCount FROM song WHERE id = ?').bind(song.id).first<{ publishedTapeCount: number }>();
    expect(songCount?.publishedTapeCount).toBe(1);
    expect((await searchPublic(db, `เทป ${marker}`)).some(result => result.kind === 'tape' && result.slug === saved.slug)).toBe(true);

    await saveTape(db, userId, { id: tape.id, title: `เทป ${marker}`, releaseType: 'album', year: 1998, artistIds: [artist.id], genreIds: [genre.id], labelId: label.id, tracks: [{ songId: song.id, side: 'A', position: 1 }], status: 'draft' });
    expect(await getTapeBySlug(db, saved.slug)).toBeNull();
    expect((await db.prepare('SELECT publishedTapeCount FROM artist WHERE id = ?').bind(artist.id).first<{ publishedTapeCount: number }>())?.publishedTapeCount).toBe(0);
  });
});
