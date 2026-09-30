import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { SEED_SIZES, seedCatalog, type SeedResult } from '../fixtures/catalog-seed';
import { CATALOG_LETTERS } from '../../src/domain/thai';
import { loadArtistDetail } from '../../src/loaders/artist-detail';
import { loadRandomArtist } from '../../src/loaders/artist-random';
import { loadArtists } from '../../src/loaders/artists';
import { loadPersonDetail } from '../../src/loaders/person-detail';

let seeded: SeedResult;
const one = async <T>(query: string, ...binds: unknown[]) => (await env.DB.prepare(query).bind(...binds).first<T>())!;

async function insertHiddenArtist(): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO artist (id, slug, name, nameSort, createdAt, updatedAt) VALUES (?, ?, 'ศิลปินร่าง', 'ศิลปินร่าง', 1, 1)").bind(id, `hidden-${id}`).run();
  return `hidden-${id}`;
}

beforeAll(async () => {
  seeded = await seedCatalog(env.DB, SEED_SIZES.parity);
}, 120_000);

describe('artist and person loaders', () => {
  it('loads the artist listing by the default letter, a requested letter and a province', async () => {
    const byDefault = await loadArtists(env.DB, new URLSearchParams());
    expect(byDefault.province).toBeNull();
    expect(CATALOG_LETTERS).toContain(byDefault.letter);
    expect(byDefault.artists.length).toBeGreaterThan(0);
    expect(byDefault.next).toBeNull();

    const latin = await loadArtists(env.DB, new URLSearchParams({ l: 'A' }));
    expect(latin.letter).toBe('A');
    expect(latin.artists.length).toBeGreaterThan(0);
    expect(latin.artists.every(artist => artist.name.startsWith('Asanee'))).toBe(true);

    const province = await loadArtists(env.DB, new URLSearchParams({ province: 'เชียงใหม่', l: 'A' }));
    expect(province).toMatchObject({ province: 'เชียงใหม่', letter: null, artists: [], next: null });

    const unknownProvince = await loadArtists(env.DB, new URLSearchParams({ province: 'ไม่มีจังหวัดนี้', l: 'A' }));
    expect(unknownProvince).toMatchObject({ province: null, letter: 'A' });
  });

  it('loads an artist page with its tapes, songs, members, sources and relations', async () => {
    const artist = await one<{ slug: string }>('SELECT slug FROM artist WHERE id = ?', seeded.artistIds[0]);
    const model = await loadArtistDetail(env.DB, artist.slug, new URLSearchParams(), null);
    expect(model).not.toBeNull();
    expect(model!.artist.id).toBe(seeded.artistIds[0]);
    expect(model!.artist.createdByName).toBe('เจ้าของคลัง');
    expect(model!.publicArtist).toBe(true);
    expect(model!.catalogSources).toHaveLength(1);
    expect(model!.explicitRelations).toHaveLength(1);
    expect(model!.members).toHaveLength(1);
    expect(model!.members[0].personSlug).not.toBeNull();
    expect(model!.page.items).toHaveLength(2);
    expect(model!.songs.length).toBeGreaterThan(0);
    expect(model!.nextSongCursor).toBeNull();
    expect(model!.genreNames.length).toBeGreaterThan(0);
    expect(model!.lastLabel).not.toBeNull();
    expect(Array.isArray(model!.appearances)).toBe(true);
    expect(Array.isArray(model!.similarArtists)).toBe(true);
    expect(Array.isArray(model!.relatedLinks)).toBe(true);
  });

  it('shows artists with nothing public to admins only, and returns null for unknown slugs', async () => {
    const hidden = await insertHiddenArtist();
    expect(await loadArtistDetail(env.DB, hidden, new URLSearchParams(), { role: 'member' })).toBeNull();
    const asAdmin = await loadArtistDetail(env.DB, hidden, new URLSearchParams(), { role: 'admin' });
    expect(asAdmin).toMatchObject({ publicArtist: false, members: [], songs: [], genreNames: [], lastLabel: null });
    expect(asAdmin!.page.items).toEqual([]);
    expect(await loadArtistDetail(env.DB, 'no-such-artist', new URLSearchParams(), { role: 'admin' })).toBeNull();
  });

  it('picks a random visible artist', async () => {
    await insertHiddenArtist();
    for (const sample of [0, 0.5, 0.999]) {
      const model = await loadRandomArtist(env.DB, () => sample);
      expect(model).not.toBeNull();
      expect(await loadArtistDetail(env.DB, model!.slug, new URLSearchParams(), null)).not.toBeNull();
    }
  });

  it('loads a person page, hides people with nothing public from non-admins, and returns null for unknown slugs', async () => {
    const person = await one<{ slug: string }>("SELECT slug FROM person WHERE name = 'บุคคลทดสอบ'");
    const model = await loadPersonDetail(env.DB, person.slug, null);
    expect(model).not.toBeNull();
    expect(model!.person.name).toBe('บุคคลทดสอบ');
    expect(model!.appearances).toHaveLength(1);
    expect(model!.appearances[0].artistSlug).toBe((await one<{ slug: string }>('SELECT slug FROM artist WHERE id = ?', seeded.artistIds[0])).slug);
    expect(model!.credits).toHaveLength(1);
    expect(model!.credits[0].role).toBe('โปรดิวเซอร์');

    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO person (id, slug, name, createdAt, updatedAt) VALUES (?, ?, 'บุคคลไม่มีผลงาน', 1, 1)").bind(id, `lonely-${id}`).run();
    expect(await loadPersonDetail(env.DB, `lonely-${id}`, { role: 'member' })).toBeNull();
    expect(await loadPersonDetail(env.DB, `lonely-${id}`, { role: 'admin' })).toMatchObject({ person: { id, name: 'บุคคลไม่มีผลงาน', bio: '' }, appearances: [], credits: [] });
    expect(await loadPersonDetail(env.DB, 'no-such-person', { role: 'admin' })).toBeNull();
  });
});
