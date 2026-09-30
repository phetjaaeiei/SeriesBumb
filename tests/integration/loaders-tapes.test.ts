import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { SEED_SIZES, seedCatalog, type SeedResult } from '../fixtures/catalog-seed';
import { loadCollectionDetail } from '../../src/loaders/collection-detail';
import { loadCollections } from '../../src/loaders/collections';
import { loadDecade } from '../../src/loaders/decades';
import { loadHome } from '../../src/loaders/home';
import { loadLatest } from '../../src/loaders/latest';
import { loadTapeDetail } from '../../src/loaders/tape-detail';
import { loadTapes } from '../../src/loaders/tapes';
import { loadTapesPartial } from '../../src/loaders/tapes-partial';

let seeded: SeedResult;
const one = async <T>(query: string, ...binds: unknown[]) => (await env.DB.prepare(query).bind(...binds).first<T>())!;

beforeAll(async () => {
  seeded = await seedCatalog(env.DB, SEED_SIZES.parity);
}, 120_000);

describe('home, tape and collection loaders', () => {
  it('loads the home page model', async () => {
    const model = await loadHome(env.DB);
    expect(model.publishedTapeCount).toBeGreaterThanOrEqual(30);
    expect(model.publicSongCount).toBeGreaterThan(0);
    expect(model.recent?.items).toHaveLength(10);
    expect(model.updated).toHaveLength(10);
    expect(model.owned.length).toBeGreaterThan(0);
    expect(model.owned.every(item => item.ownerCount > 0)).toBe(true);
    expect(model.featured).toHaveLength(2);
    expect(model.recentSongs).toEqual([]);
  });

  it('loads the tape listing and parses its filters', async () => {
    const all = await loadTapes(env.DB, new URLSearchParams());
    expect(all.genres).toHaveLength(SEED_SIZES.parity.genres);
    expect(all).toMatchObject({ sort: 'new', view: 'table', showLetters: false, letter: null, decade: null, releaseType: null });
    expect(all.allowedSorts).toEqual(['new', 'year', 'title']);
    expect(all.page.items).toHaveLength(24);
    expect(all.page.nextCursor).not.toBeNull();
    expect(all.page.items[0].artists.length).toBeGreaterThan(0);

    const genre = all.genres[0];
    const byGenre = await loadTapes(env.DB, new URLSearchParams({ genre: genre.slug, sort: 'title', view: 'grid' }));
    expect(byGenre.genre?.id).toBe(genre.id);
    expect(byGenre).toMatchObject({ allowedSorts: ['new'], sort: 'new', view: 'grid' });
    expect(byGenre.page.items.length).toBeGreaterThan(0);

    const byTitle = await loadTapes(env.DB, new URLSearchParams({ sort: 'title', l: 'อ' }));
    expect(byTitle).toMatchObject({ sort: 'title', showLetters: true });
  });

  it('loads the load-more partial for label and artist listings', async () => {
    const label = await one<{ slug: string }>("SELECT l.slug FROM label l JOIN tape t ON t.labelId = l.id AND t.status = 'published' LIMIT 1");
    const byLabel = await loadTapesPartial(env.DB, new URLSearchParams({ label: label.slug }));
    expect(byLabel.showLabel).toBe(false);
    expect(byLabel.page.items.length).toBeGreaterThan(0);
    expect(byLabel.page.items.every(item => item.labelSlug === label.slug)).toBe(true);

    const artist = await one<{ slug: string }>('SELECT slug FROM artist WHERE id = ?', seeded.artistIds[0]);
    const byArtist = await loadTapesPartial(env.DB, new URLSearchParams({ artist: artist.slug, view: 'grid' }));
    expect(byArtist).toMatchObject({ showLabel: false, view: 'grid' });
    expect(byArtist.page.items.every(item => item.artists.some(a => a.slug === artist.slug))).toBe(true);

    const unknown = await loadTapesPartial(env.DB, new URLSearchParams({ label: 'no-such-label' }));
    expect(unknown.showLabel).toBe(true);
    expect(unknown.page.items).toHaveLength(24);
  });

  it('loads a published tape for guests and members, and drafts only for admins', async () => {
    const tape = await one<{ slug: string }>('SELECT slug FROM tape WHERE id = ?', seeded.tapeIds[0]);
    const guest = await loadTapeDetail(env.DB, tape.slug, null);
    expect(guest).not.toBeNull();
    expect(guest!.tape.id).toBe(seeded.tapeIds[0]);
    expect(guest!.unpublished).toBe(false);
    expect(guest!.catalogSources).toHaveLength(1);
    expect(guest!.credits).toHaveLength(1);
    expect(guest!.editions).toHaveLength(1);
    expect(guest!.firstComments?.items).toHaveLength(SEED_SIZES.parity.members);
    expect(guest!.publicReviews).toHaveLength(1);
    expect(guest!.engagement).toBeNull();
    expect(guest!.collections.length).toBeGreaterThan(0);

    const member = seeded.members[0];
    const asMember = await loadTapeDetail(env.DB, tape.slug, { id: member.id, role: 'member' });
    expect(asMember!.engagement).toEqual({ liked: 1, owned: 0 });

    const draft = await one<{ slug: string }>("SELECT slug FROM tape WHERE status = 'draft' LIMIT 1");
    expect(await loadTapeDetail(env.DB, draft.slug, { id: member.id, role: 'member' })).toBeNull();
    const asAdmin = await loadTapeDetail(env.DB, draft.slug, { id: seeded.admin.id, role: 'admin' });
    expect(asAdmin).toMatchObject({ unpublished: true, editions: [], engagement: null, firstComments: null, publicReviews: [] });

    expect(await loadTapeDetail(env.DB, 'no-such-tape', null)).toBeNull();
  });

  it('loads the latest page model', async () => {
    const model = await loadLatest(env.DB);
    expect(model.recent.items.length).toBeGreaterThanOrEqual(30);
    expect(model.updated.length).toBeGreaterThanOrEqual(30);
    expect(Array.isArray(model.recentSongs)).toBe(true);
  });

  it('loads a decade and rejects decades outside the catalog', async () => {
    const row = await one<{ decade: number }>("SELECT decade FROM tape WHERE status = 'published' AND decade IS NOT NULL LIMIT 1");
    const model = await loadDecade(env.DB, `${row.decade}s`, new URLSearchParams({ sort: 'year' }));
    expect(model).toMatchObject({ decade: row.decade, sort: 'year' });
    expect(model!.page.items.length).toBeGreaterThan(0);
    expect(await loadDecade(env.DB, '1890s', new URLSearchParams())).toBeNull();
    expect(await loadDecade(env.DB, 'eighties', new URLSearchParams())).toBeNull();
  });

  it('loads the collection list and a collection page', async () => {
    const list = await loadCollections(env.DB);
    expect(list.collections).toHaveLength(SEED_SIZES.parity.collections);
    expect(list.collections[0].tapeCount).toBe(5);

    const detail = await loadCollectionDetail(env.DB, list.collections[0].slug, null);
    expect(detail).not.toBeNull();
    expect(detail!.collection.id).toBe(list.collections[0].id);
    expect(detail!.items).toHaveLength(5);
    expect(detail!.coverKey).toBe(list.collections[0].displayCoverKey ?? undefined);

    expect(await loadCollectionDetail(env.DB, 'no-such-collection', { role: 'admin' })).toBeNull();
  });
});
