import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createArtist, createCollection, createGenre, createLabel, createSong, createTapeDraft, saveArtist, saveCollection, saveGenre, saveLabel, saveSong, saveTape } from '../../src/lib/services/catalog';
import { getTapeBySlug } from '../../src/lib/queries/tapes';
import { searchPublic } from '../../src/lib/search';

const db = env.DB;

describe('catalog save and publish', () => {
  it('publishes a standalone song and its artist without publishing a draft tape', async () => {
    const userId = crypto.randomUUID();
    const now = Date.now();
    await db.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)')
      .bind(userId, 'แอดมินทดสอบ', `${userId}@example.com`, now, now).run();
    const marker = userId.slice(0, 8);
    const artist = await createArtist(db, userId, `Solo Artist ${marker}`);
    const song = await createSong(db, userId, { title: `Solo Song ${marker}`, artistIds: [artist.id] });
    expect((await db.prepare('SELECT isPublic, publishedTapeCount FROM song WHERE id = ?').bind(song.id).first<{ isPublic: number; publishedTapeCount: number }>()))
      .toMatchObject({ isPublic: 0, publishedTapeCount: 0 });
    expect((await searchPublic(db, `Solo Song ${marker}`)).some(item => item.slug === song.slug)).toBe(false);

    await saveSong(db, userId, { id: song.id, title: `Solo Song ${marker}`, artistIds: [artist.id], isPublic: true });
    expect((await searchPublic(db, `Solo Song ${marker}`)).some(item => item.kind === 'song' && item.slug === song.slug)).toBe(true);
    expect((await searchPublic(db, `Solo Artist ${marker}`)).some(item => item.kind === 'artist' && item.slug === artist.slug)).toBe(true);
    expect((await db.prepare('SELECT publishedTapeCount FROM song WHERE id = ?').bind(song.id).first<{ publishedTapeCount: number }>())?.publishedTapeCount).toBe(0);

    await saveSong(db, userId, { id: song.id, title: `Solo Song ${marker}`, artistIds: [artist.id], isPublic: false });
    expect((await searchPublic(db, `Solo Song ${marker}`)).some(item => item.slug === song.slug)).toBe(false);
    expect((await searchPublic(db, `Solo Artist ${marker}`)).some(item => item.slug === artist.slug)).toBe(false);
  });

  it('keeps non-tape slugs after ordinary edits and changes them only when requested', async () => {
    const userId = crypto.randomUUID();
    const now = Date.now();
    await db.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').bind(userId, 'แอดมินทดสอบ', `${userId}@example.com`, now, now).run();
    const marker = userId.slice(0, 8);
    const artist = await createArtist(db, userId, `Artist ${marker}`);
    const label = await createLabel(db, userId, `Label ${marker}`);
    const song = await createSong(db, userId, { title: `Song ${marker}` });
    const genre = await createGenre(db, `Genre ${marker}`);
    const collection = await createCollection(db, userId, `Collection ${marker}`);

    expect((await saveArtist(db, userId, { id: artist.id, name: `Renamed Artist ${marker}` })).slug).toBe(artist.slug);
    expect((await saveLabel(db, userId, { id: label.id, name: `Renamed Label ${marker}` })).slug).toBe(label.slug);
    expect((await saveSong(db, userId, { id: song.id, title: `Renamed Song ${marker}` })).slug).toBe(song.slug);
    expect((await saveGenre(db, { id: genre.id, name: `Renamed Genre ${marker}` })).slug).toBe(genre.slug);
    expect((await saveCollection(db, userId, { id: collection.id, title: `Renamed Collection ${marker}`, status: 'draft' })).slug).toBe(collection.slug);

    const customSlug = `artist-custom-${marker}`;
    expect((await saveArtist(db, userId, { id: artist.id, name: `Renamed Artist ${marker}`, slug: customSlug })).slug).toBe(customSlug);
    expect((await saveArtist(db, userId, { id: artist.id, name: `Third Artist ${marker}` })).slug).toBe(customSlug);
  });

  it('auto-generates tape slug before first publish, then preserves it across title edits and unpublishing', async () => {
    const userId = crypto.randomUUID();
    const now = Date.now();
    await db.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').bind(userId, 'แอดมินทดสอบ', `${userId}@example.com`, now, now).run();
    const marker = userId.slice(0, 8);
    const artist = await createArtist(db, userId, `Artist ${marker}`);
    const tape = await createTapeDraft(db, userId, `Draft ${marker}`);
    const saveInput = { id: tape.id, releaseType: 'album' as const, artistIds: [artist.id] };
    const draft = await saveTape(db, userId, { ...saveInput, title: `First ${marker}`, year: 2541, status: 'draft' });
    expect(draft.slug).toBe(`first-${marker}-1998`);
    const revised = await saveTape(db, userId, { ...saveInput, title: `Second ${marker}`, year: 2542, status: 'draft' });
    expect(revised.slug).toBe(`second-${marker}-1999`);
    await db.prepare("INSERT INTO tape_image (id, tapeId, kind, fullKey, thumbKey, width, height, bytes, position) VALUES (?, ?, 'front', ?, ?, 1200, 1200, 100, 0)")
      .bind(crypto.randomUUID(), tape.id, `tapes/${tape.id}/front-full.webp`, `tapes/${tape.id}/front-thumb.webp`).run();
    const published = await saveTape(db, userId, { ...saveInput, title: `Second ${marker}`, year: 2542, status: 'published' });
    expect(published.slug).toBe(revised.slug);
    const edited = await saveTape(db, userId, { ...saveInput, title: `Third ${marker}`, year: 2543, status: 'published' });
    expect(edited.slug).toBe(published.slug);
    const unpublished = await saveTape(db, userId, { ...saveInput, title: `Fourth ${marker}`, status: 'draft' });
    expect(unpublished.slug).toBe(published.slug);
    const customSlug = `tape-custom-${marker}`;
    expect((await saveTape(db, userId, { ...saveInput, title: `Fifth ${marker}`, status: 'draft', slug: customSlug })).slug).toBe(customSlug);
    expect((await saveTape(db, userId, { ...saveInput, title: `Sixth ${marker}`, status: 'draft' })).slug).toBe(customSlug);
    expect((await db.prepare('SELECT slugLocked FROM tape WHERE id = ?').bind(tape.id).first<{ slugLocked: number }>())?.slugLocked).toBe(1);
  });

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
