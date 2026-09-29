import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { SEED_SIZES, seedCatalog, type SeedResult } from '../fixtures/catalog-seed';
import type { SqlClient } from '../../src/db/sql-client';
import { loadMe } from '../../src/loaders/me';
import { loadMeSubmissions } from '../../src/loaders/me-submissions';
import { loadRandomTape } from '../../src/loaders/random';
import { loadReviews } from '../../src/loaders/reviews';
import { loadSearch } from '../../src/loaders/search';
import { loadAdvancedSearch } from '../../src/loaders/search-advanced';

let seeded: SeedResult;
const one = async <T>(query: string, ...binds: unknown[]) => (await env.DB.prepare(query).bind(...binds).first<T>())!;

beforeAll(async () => {
  seeded = await seedCatalog(env.DB, SEED_SIZES.parity);
}, 120_000);

describe('search, reviews, random and member loaders', () => {
  it('runs the quick search only with a query', async () => {
    const artist = await one<{ slug: string; name: string }>('SELECT slug, name FROM artist WHERE id = ?', seeded.artistIds[0]);
    const model = await loadSearch(env.DB, new URLSearchParams({ q: `  ${artist.name}  ` }));
    expect(model.q).toBe(artist.name);
    expect(model.results.some(result => result.kind === 'artist' && result.slug === artist.slug)).toBe(true);

    expect(await loadSearch(env.DB, new URLSearchParams())).toEqual({ q: '', results: [] });
    expect((await loadSearch(env.DB, new URLSearchParams({ q: 'ไม่มีคำนี้ในคลังแน่นอน' }))).results).toEqual([]);
  });

  it('parses advanced search filters and loads one page with the filter options', async () => {
    const publicSongs = await one<{ n: number }>('SELECT COUNT(*) AS n FROM song WHERE isPublic = 1');
    const model = await loadAdvancedSearch(env.DB, new URLSearchParams({ kind: 'unknown', yearFrom: '1800' }));
    expect(model.filters).toMatchObject({ kind: 'song', query: '', yearFrom: null, cursor: null });
    expect(model.items).toHaveLength(Math.min(20, publicSongs.n));
    expect(model.nextCursor === null).toBe(publicSongs.n <= 20);
    expect(model.genres).toHaveLength(SEED_SIZES.parity.genres);
    const artistsWithPublicSongs = await one<{ n: number }>('SELECT COUNT(*) AS n FROM artist a WHERE EXISTS (SELECT 1 FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = a.id AND s.isPublic = 1)');
    expect(model.artists).toHaveLength(Math.min(100, artistsWithPublicSongs.n));
    const labelsWithTapes = await one<{ n: number }>('SELECT COUNT(*) AS n FROM label WHERE publishedTapeCount > 0');
    expect(labelsWithTapes.n).toBeGreaterThan(0);
    expect(model.labels).toHaveLength(Math.min(100, labelsWithTapes.n));

    const label = await one<{ id: string; slug: string }>('SELECT id, slug FROM label WHERE publishedTapeCount > 0 ORDER BY nameSort LIMIT 1');
    const tapes = await loadAdvancedSearch(env.DB, new URLSearchParams({ kind: 'tape', label: label.slug }));
    expect(tapes.filters).toMatchObject({ kind: 'tape', label: label.slug });
    expect(tapes.items.length).toBeGreaterThan(0);
    for (const item of tapes.items) {
      expect(await one<{ labelId: string; status: string }>('SELECT labelId, status FROM tape WHERE id = ?', item.id)).toEqual({ labelId: label.id, status: 'published' });
    }
  });

  it('pages the published review feed', async () => {
    const tape = await one<{ slug: string; title: string }>('SELECT slug, title FROM tape WHERE id = ?', seeded.tapeIds[0]);
    const model = await loadReviews(env.DB, new URLSearchParams());
    expect(model.next).toBeNull();
    expect(model.items).toHaveLength(1);
    expect(model.items[0]).toMatchObject({ slug: tape.slug, title: tape.title, rating: 5 });
    expect(await loadReviews(env.DB, new URLSearchParams({ cursor: 'not-a-cursor' }))).toEqual(model);
  });

  it('picks a random published tape, falling back to the first one, and null without tapes', async () => {
    for (const sample of [0, 0.5, 0.999999]) {
      const model = await loadRandomTape(env.DB, () => sample);
      expect(model).not.toBeNull();
      expect(await one<{ status: string }>('SELECT status FROM tape WHERE slug = ?', model!.slug)).toEqual({ status: 'published' });
    }
    const empty = { prepare: () => ({ bind() { return this; }, first: async () => ({ value: null }) }) } as unknown as SqlClient;
    expect(await loadRandomTape(empty)).toBeNull();
  });

  it('loads a member\'s saved tapes and songs, paging only the requested tab', async () => {
    const member = seeded.members[0];
    const model = await loadMe(env.DB, new URLSearchParams({ tab: 'nope' }), member);
    expect(model.activeTab).toBe('liked-tapes');
    expect(model.likedTapes).toMatchObject({ next: null, items: [{ id: seeded.tapeIds[0] }] });
    expect(model.likedSongs).toMatchObject({ next: null, items: [{ id: seeded.songIds[0] }] });
    expect(model.owned).toMatchObject({ next: null, items: [{ id: seeded.tapeIds[1] }] });
    expect((await loadMe(env.DB, new URLSearchParams({ tab: 'owned' }), member)).activeTab).toBe('owned');
    expect(await loadMe(env.DB, new URLSearchParams(), { id: crypto.randomUUID() })).toMatchObject({ likedTapes: { items: [] }, likedSongs: { items: [] }, owned: { items: [] } });
  });

  it('loads a member\'s reviews and corrections in any status', async () => {
    const tape = await one<{ slug: string; title: string }>('SELECT slug, title FROM tape WHERE id = ?', seeded.tapeIds[0]);
    const model = await loadMeSubmissions(env.DB, seeded.members[0]);
    expect(model.reviews).toMatchObject([{ status: 'published', rating: 5, slug: tape.slug, title: tape.title }]);
    expect(model.corrections).toMatchObject([{ status: 'pending', title: tape.title, proposedChange: 'ปีที่ออกน่าจะเป็น 2531' }]);
    expect(await loadMeSubmissions(env.DB, { id: crypto.randomUUID() })).toEqual({ reviews: [], corrections: [] });
  });
});
