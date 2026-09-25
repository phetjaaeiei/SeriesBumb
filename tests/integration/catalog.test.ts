import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { getTapeBySlug, getTapePage } from '../../src/lib/queries/tapes';

const db = env.DB;
const now = Date.now();

describe('public tape reads', () => {
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
    for (const [id, suffix, status] of [
      [publishedId, 'published', 'published'],
      [draftId, 'draft', 'draft'],
    ] as const) {
      await db.prepare('INSERT INTO tape (id, slug, title, titleSort, releaseType, status, publishedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, `${marker}-${suffix}`, suffix, `2${suffix}`, 'album', status, status === 'published' ? now : null, now, now).run();
    }
    expect((await getTapeBySlug(db, `${marker}-published`))?.id).toBe(publishedId);
    expect(await getTapeBySlug(db, `${marker}-draft`)).toBeNull();
  });
});
