import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { getTapeBySlug, getTapePage } from '../../src/repositories/tapes.repo';
import { thaiSortKey } from '../../src/domain/thai';

const db = env.DB;
const now = Date.now();

describe('public tape reads', () => {
  it('filters title-sorted tapes by Thai, Latin, and numeric first letters', async () => {
    const marker = crypto.randomUUID();
    const fixtures = [
      ['thai', 'เก็บรัก', 'published'],
      ['latin', 'ABBA', 'published'],
      ['numeric', '123 เพลง', 'published'],
      ['draft', 'กาลเวลา', 'draft'],
    ] as const;
    for (const [suffix, title, status] of fixtures) {
      await db.prepare('INSERT INTO tape (id, slug, title, titleSort, releaseType, status, publishedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(`${marker}-${suffix}`, `${marker}-${suffix}`, title, thaiSortKey(title), 'album', status, status === 'published' ? now : null, now, now).run();
    }
    const thai = await getTapePage(db, { sort: 'title', letter: 'ก' });
    expect(thai.items.map(item => item.id)).toContain(`${marker}-thai`);
    expect(thai.items.map(item => item.id)).not.toContain(`${marker}-draft`);
    const latin = await getTapePage(db, { sort: 'title', letter: 'A' });
    expect(latin.items.map(item => item.id)).toContain(`${marker}-latin`);
    const numeric = await getTapePage(db, { sort: 'title', letter: '0-9' });
    expect(numeric.items.map(item => item.id)).toContain(`${marker}-numeric`);
  });

  it('paginates published tapes by keyset and never includes a draft', async () => {
    const marker = crypto.randomUUID();
    const artistId = crypto.randomUUID();
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    const draftId = crypto.randomUUID();
    await db.prepare('INSERT INTO artist (id, slug, name, nameSort, createdAt, updatedAt, publishedTapeCount) VALUES (?, ?, ?, ?, ?, ?, 2)')
      .bind(artistId, `artist-${marker}`, 'ศิลปินทดสอบ', '1ศ', now, now).run();
    for (const [id, suffix, status, publishedAt] of [
      [firstId, 'first', 'published', now + 2],
      [secondId, 'second', 'published', now + 1],
      [draftId, 'draft', 'draft', null],
    ] as const) {
      await db.prepare('INSERT INTO tape (id, slug, title, titleSort, releaseType, status, publishedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, `${marker}-${suffix}`, suffix, `2${suffix}`, 'album', status, publishedAt, now, now).run();
      await db.prepare('INSERT INTO tape_artist (tapeId, artistId, position, isPublished) VALUES (?, ?, 0, ?)')
        .bind(id, artistId, status === 'published' ? 1 : 0).run();
    }

    const first = await getTapePage(db, { sort: 'new', pageSize: 1 });
    expect(first.items[0]?.id).toBe(firstId);
    expect(first.items[0]?.artists).toEqual([{ name: 'ศิลปินทดสอบ', slug: `artist-${marker}` }]);
    expect(first.nextCursor).toBeTruthy();
    const second = await getTapePage(db, { sort: 'new', pageSize: 1, cursor: first.nextCursor });
    expect(second.items[0]?.id).toBe(secondId);
    expect(second.items.every((item) => item.id !== draftId)).toBe(true);
  });

  it('loads a published detail while hiding a draft at its public URL', async () => {
    const marker = crypto.randomUUID();
    const publishedId = crypto.randomUUID();
    const draftId = crypto.randomUUID();
    const songId = crypto.randomUUID();
    for (const [id, suffix, status] of [
      [publishedId, 'published', 'published'],
      [draftId, 'draft', 'draft'],
    ] as const) {
      await db.prepare('INSERT INTO tape (id, slug, title, titleSort, releaseType, status, publishedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, `${marker}-${suffix}`, suffix, `2${suffix}`, 'album', status, status === 'published' ? now : null, now, now).run();
    }
    await db.prepare('INSERT INTO song (id, slug, title, titleSort, lyrics, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(songId, `${marker}-song`, 'เพลงทดสอบ', 'เพลงทดสอบ', 'เนื้อเพลงทดสอบ', now, now).run();
    await db.prepare("INSERT INTO tape_track (id, tapeId, songId, side, position) VALUES (?, ?, ?, 'A', 1)")
      .bind(crypto.randomUUID(), publishedId, songId).run();
    const detail = await getTapeBySlug(db, `${marker}-published`);
    expect(detail?.id).toBe(publishedId);
    expect(detail?.tracks[0]?.hasLyrics).toBe(1);
    expect(await getTapeBySlug(db, `${marker}-draft`)).toBeNull();
  });
});
