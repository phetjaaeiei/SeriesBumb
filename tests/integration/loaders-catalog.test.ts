import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { SEED_SIZES, seedCatalog, type SeedResult } from '../fixtures/catalog-seed';
import { loadGenreDetail } from '../../src/loaders/genre-detail';
import { loadGenres } from '../../src/loaders/genres';
import { loadLabelDetail } from '../../src/loaders/label-detail';
import { loadLabels } from '../../src/loaders/labels';
import { loadSongDetail } from '../../src/loaders/song-detail';
import { loadSongs } from '../../src/loaders/songs';

let seeded: SeedResult;
const one = async <T>(query: string, ...binds: unknown[]) => (await env.DB.prepare(query).bind(...binds).first<T>())!;

beforeAll(async () => {
  seeded = await seedCatalog(env.DB, SEED_SIZES.parity);
}, 120_000);

describe('song, label and genre loaders', () => {
  it('pages through the song listing by title', async () => {
    const first = await loadSongs(env.DB, new URLSearchParams());
    expect(first.hasCursor).toBe(false);
    expect(first.songs).toHaveLength(50);
    expect(first.songs[0].artists).not.toBeNull();
    expect(first.next).not.toBeNull();

    const second = await loadSongs(env.DB, new URLSearchParams({ cursor: first.next! }));
    expect(second.hasCursor).toBe(true);
    expect(second.songs.length).toBeGreaterThan(0);
    expect(second.songs.some(song => first.songs.some(seen => seen.id === song.id))).toBe(false);
    expect(second.next).toBeNull();

    expect((await loadSongs(env.DB, new URLSearchParams({ cursor: 'not-a-cursor' }))).hasCursor).toBe(false);
  });

  it('loads a song page with its singers, tapes, like state and comments', async () => {
    const song = await one<{ slug: string }>('SELECT slug FROM song WHERE id = ?', seeded.songIds[0]);
    const liker = seeded.members[0];
    const model = await loadSongDetail(env.DB, song.slug, { id: liker.id, role: liker.role });
    expect(model).not.toBeNull();
    expect(model!.song.id).toBe(seeded.songIds[0]);
    expect(model!.song.createdByName).toBe('เจ้าของคลัง');
    expect(model!.song.lyrics).not.toBeNull();
    expect(model!.publicSong).toBe(true);
    expect(model!.artists).toHaveLength(1);
    expect(model!.tapes.length).toBeGreaterThan(0);
    expect(model!.tapes[0]).toMatchObject({ side: 'A', position: 1 });
    expect(model!.liked).toBe(true);
    expect(model!.firstComments).toMatchObject({ items: [], nextCursor: null });
    expect(model!.catalogSources).toEqual([]);
    expect(model!.credits).toEqual([]);

    expect((await loadSongDetail(env.DB, song.slug, null))!.liked).toBe(false);
  });

  it('shows hidden songs to admins only, and returns null for unknown slugs', async () => {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO song (id, slug, title, titleSort, createdAt, updatedAt) VALUES (?, ?, 'เพลงร่าง', 'เพลงร่าง', 1, 1)").bind(id, `hidden-${id}`).run();
    expect(await loadSongDetail(env.DB, `hidden-${id}`, { id: seeded.members[0].id, role: 'member' })).toBeNull();
    const asAdmin = await loadSongDetail(env.DB, `hidden-${id}`, { id: seeded.admin.id, role: 'admin' });
    expect(asAdmin).toMatchObject({ publicSong: false, artists: [], tapes: [], liked: false, firstComments: null });
    expect(await loadSongDetail(env.DB, 'no-such-song', { id: seeded.admin.id, role: 'admin' })).toBeNull();
  });

  it('loads the label listing and a label page with its year range and tapes', async () => {
    const listing = await loadLabels(env.DB, new URLSearchParams());
    const visible = await one<{ count: number }>('SELECT COUNT(*) AS count FROM label WHERE publishedTapeCount > 0');
    expect(visible.count).toBeGreaterThan(0);
    expect(listing.labels).toHaveLength(visible.count);
    expect(listing.labels.every(label => label.publishedTapeCount > 0)).toBe(true);
    expect(listing.next).toBeNull();

    const label = await one<{ slug: string; id: string }>('SELECT l.slug, l.id FROM label l JOIN tape t ON t.labelId = l.id WHERE t.id = ?', seeded.tapeIds[0]);
    const model = await loadLabelDetail(env.DB, label.slug, new URLSearchParams(), null);
    expect(model).not.toBeNull();
    expect(model!.label.id).toBe(label.id);
    expect(model!.label.createdByName).toBe('เจ้าของคลัง');
    expect(model!.sort).toBe('new');
    expect(model!.range?.firstYear).not.toBeNull();
    expect(model!.page.items.length).toBeGreaterThan(0);
    expect(model!.page.items.every(item => item.labelSlug === label.slug)).toBe(true);

    const byYear = await loadLabelDetail(env.DB, label.slug, new URLSearchParams({ sort: 'year' }), null);
    expect(byYear!.sort).toBe('year');
  });

  it('shows labels without published tapes to admins only, and returns null for unknown slugs', async () => {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO label (id, slug, name, nameSort, createdAt, updatedAt) VALUES (?, ?, 'ค่ายร่าง', 'ค่ายร่าง', 1, 1)").bind(id, `hidden-${id}`).run();
    expect(await loadLabelDetail(env.DB, `hidden-${id}`, new URLSearchParams(), { role: 'member' })).toBeNull();
    const asAdmin = await loadLabelDetail(env.DB, `hidden-${id}`, new URLSearchParams(), { role: 'admin' });
    expect(asAdmin).toMatchObject({ label: { id, publishedTapeCount: 0 }, range: { firstYear: null, lastYear: null }, sort: 'new' });
    expect(asAdmin!.page.items).toEqual([]);
    expect(await loadLabelDetail(env.DB, 'no-such-label', new URLSearchParams(), { role: 'admin' })).toBeNull();
  });

  it('loads the genre listing and a genre page, and returns null for unknown slugs', async () => {
    const listing = await loadGenres(env.DB);
    expect(listing.genres).toHaveLength(SEED_SIZES.parity.genres);

    const genre = await one<{ slug: string; id: string }>('SELECT g.slug, g.id FROM genre g JOIN tape_genre tg ON tg.genreId = g.id WHERE tg.tapeId = ?', seeded.tapeIds[0]);
    const model = await loadGenreDetail(env.DB, genre.slug, new URLSearchParams());
    expect(model).not.toBeNull();
    expect(model!.genre.id).toBe(genre.id);
    expect(model!.genre.publishedTapeCount).toBeGreaterThan(0);
    expect(model!.page.items.length).toBeGreaterThan(0);
    expect(listing.genres.find(row => row.slug === genre.slug)?.publishedTapeCount).toBe(model!.genre.publishedTapeCount);

    expect(await loadGenreDetail(env.DB, 'no-such-genre', new URLSearchParams())).toBeNull();
  });
});
