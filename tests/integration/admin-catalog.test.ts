import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { getAdminCatalogPage } from '../../src/repositories/admin-catalog.repo';
import { normalizeThai } from '../../src/domain/thai';

const db = env.DB;

async function index(kind: string, refId: string, title: string, isPublic = 0) {
  await db.prepare('INSERT INTO search_doc (kind, refId, isPublic, nameKey) VALUES (?, ?, ?, ?)')
    .bind(kind, refId, isPublic, normalizeThai(title)).run();
  await db.prepare('INSERT INTO search_fts (rowid, text) SELECT docId, ? FROM search_doc WHERE kind = ? AND refId = ?')
    .bind(normalizeThai(title), kind, refId).run();
}

describe('admin catalog list', () => {
  it('searches draft and published tapes, filters status, and pages by update time', async () => {
    const marker = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
    const rows = [
      { id: `${marker}-a`, title: `เทป ${marker} หนึ่ง`, status: 'published', updatedAt: 103 },
      { id: `${marker}-b`, title: `เทป ${marker} สอง`, status: 'draft', updatedAt: 102 },
      { id: `${marker}-c`, title: `เทป ${marker} สาม`, status: 'published', updatedAt: 101 },
    ] as const;
    for (const row of rows) {
      await db.prepare('INSERT INTO tape (id, slug, title, titleSort, releaseType, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(row.id, row.id, row.title, row.title, 'album', row.status, 100, row.updatedAt).run();
      await index('tape', row.id, row.title, row.status === 'published' ? 1 : 0);
    }

    const first = await getAdminCatalogPage(db, { kind: 'tapes', query: marker, pageSize: 1 });
    expect(first.items.map(row => row.id)).toEqual([rows[0].id]);
    expect(first.nextCursor).toBeTruthy();
    const second = await getAdminCatalogPage(db, { kind: 'tapes', query: marker, cursor: first.nextCursor, pageSize: 1 });
    expect(second.items.map(row => row.id)).toEqual([rows[1].id]);
    const third = await getAdminCatalogPage(db, { kind: 'tapes', query: marker, cursor: second.nextCursor, pageSize: 1 });
    expect(third.items.map(row => row.id)).toEqual([rows[2].id]);
    expect(third.nextCursor).toBeNull();

    const drafts = await getAdminCatalogPage(db, { kind: 'tapes', query: marker, status: 'draft' });
    expect(drafts.items.map(row => row.id)).toEqual([rows[1].id]);
    const published = await getAdminCatalogPage(db, { kind: 'tapes', query: marker, status: 'published' });
    expect(published.items.map(row => row.id)).toEqual([rows[0].id, rows[2].id]);
  });

  it('finds short name prefixes and sorts artists and labels by their name keys', async () => {
    const marker = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
    for (const kind of ['artist', 'label'] as const) {
      for (const [suffix, sort] of [['later', '2'], ['earlier', '1']] as const) {
        const id = `${kind}-${marker}-${suffix}`;
        const name = `Ab${marker} ${suffix}`;
        if (kind === 'artist') {
          await db.prepare('INSERT INTO artist (id, slug, name, nameSort, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, 1)')
            .bind(id, id, name, sort).run();
        } else {
          await db.prepare('INSERT INTO label (id, slug, name, nameSort, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, 1)')
            .bind(id, id, name, sort).run();
        }
        await index(kind, id, name);
      }
      const plural = kind === 'artist' ? 'artists' : 'labels';
      const first = await getAdminCatalogPage(db, { kind: plural, query: 'Ab', pageSize: 1 });
      expect(first.items[0]?.id).toBe(`${kind}-${marker}-earlier`);
      const second = await getAdminCatalogPage(db, { kind: plural, query: 'Ab', pageSize: 1, cursor: first.nextCursor });
      expect(second.items[0]?.id).toBe(`${kind}-${marker}-later`);
    }
  });

  it('finds songs and artists that have no tape tracks', async () => {
    const marker = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
    const tapeId = `${marker}-tape`;
    await db.prepare("INSERT INTO tape (id, slug, title, titleSort, releaseType, createdAt, updatedAt) VALUES (?, ?, 'เทป', 'เทป', 'album', 1, 1)")
      .bind(tapeId, tapeId).run();
    for (const suffix of ['linked', 'unlinked']) {
      const songId = `${marker}-${suffix}-song`;
      const artistId = `${marker}-${suffix}-artist`;
      await db.prepare('INSERT INTO song (id, slug, title, titleSort, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, 1)')
        .bind(songId, songId, `เพลง ${marker} ${suffix}`, `เพลง ${suffix}`).run();
      await db.prepare('INSERT INTO artist (id, slug, name, nameSort, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, 1)')
        .bind(artistId, artistId, `ศิลปิน ${marker} ${suffix}`, `ศิลปิน ${suffix}`).run();
      await db.prepare('INSERT INTO song_artist (songId, artistId, position) VALUES (?, ?, 0)')
        .bind(songId, artistId).run();
      await index('song', songId, `เพลง ${marker} ${suffix}`);
      await index('artist', artistId, `ศิลปิน ${marker} ${suffix}`);
      if (suffix === 'linked') {
        await db.prepare("INSERT INTO tape_track (id, tapeId, songId, side, position) VALUES (?, ?, ?, 'A', 1)")
          .bind(`${marker}-track`, tapeId, songId).run();
      }
    }
    const songs = await getAdminCatalogPage(db, { kind: 'songs', query: marker, unlinked: true });
    expect(songs.items.map(row => row.id)).toEqual([`${marker}-unlinked-song`]);
    const artists = await getAdminCatalogPage(db, { kind: 'artists', query: marker, unlinked: true });
    expect(artists.items.map(row => row.id)).toEqual([`${marker}-unlinked-artist`]);
  });

  it('paginates position-ordered genres and collections', async () => {
    const marker = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
    for (const position of [2, 1]) {
      const genreId = `${marker}-genre-${position}`;
      const collectionId = `${marker}-collection-${position}`;
      await db.prepare('INSERT INTO genre (id, slug, name, position) VALUES (?, ?, ?, ?)')
        .bind(genreId, genreId, `แนว${marker}`, position).run();
      await db.prepare('INSERT INTO collection (id, slug, title, position, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, 1)')
        .bind(collectionId, collectionId, `ชุด${marker}`, position).run();
      await index('collection', collectionId, `ชุด${marker}`);
    }
    for (const kind of ['genres', 'collections'] as const) {
      const first = await getAdminCatalogPage(db, { kind, query: marker, pageSize: 1 });
      expect(first.items[0]?.sortKey).toBe(1);
      const second = await getAdminCatalogPage(db, { kind, query: marker, pageSize: 1, cursor: first.nextCursor });
      expect(second.items[0]?.sortKey).toBe(2);
      expect(second.nextCursor).toBeNull();
    }
  });
});
