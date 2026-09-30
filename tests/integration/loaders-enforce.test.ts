import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { SEED_SIZES, seedCatalog, type SeedResult } from '../fixtures/catalog-seed';
import { loadAdminLookup } from '../../src/loaders/admin/lookup';
import { runBatch } from '../../src/repositories/batch.repo';
import { getReindexState, setReindexCursor } from '../../src/repositories/stats.repo';

let seeded: SeedResult;
const one = async <T>(query: string, ...binds: unknown[]) => (await env.DB.prepare(query).bind(...binds).first<T>())!;

beforeAll(async () => {
  seeded = await seedCatalog(env.DB, SEED_SIZES.parity);
}, 120_000);

describe('admin lookup loader', () => {
  it('finds artists and tapes by name or title after Thai normalization', async () => {
    const artist = await one<{ id: string; name: string }>('SELECT id, name FROM artist ORDER BY name LIMIT 1');
    const artists = await loadAdminLookup(env.DB, 'artists', artist.name);
    expect(artists).toContainEqual({ id: artist.id, label: artist.name });
    // Zero-width characters are stripped from the query, as the action did before it moved here.
    const [first, ...rest] = [...artist.name];
    expect(await loadAdminLookup(env.DB, 'artists', `${first}\u200b${rest.join('')}`)).toContainEqual({ id: artist.id, label: artist.name });

    const tape = await one<{ id: string; title: string }>('SELECT id, title FROM tape WHERE id = ?', seeded.tapeIds[0]);
    expect(await loadAdminLookup(env.DB, 'tapes', tape.title)).toContainEqual({ id: tape.id, label: tape.title });
  });

  it('escapes LIKE wildcards and returns no choices for an unknown name', async () => {
    expect(await loadAdminLookup(env.DB, 'artists', '%%')).toEqual([]);
    expect(await loadAdminLookup(env.DB, 'songs', '__')).toEqual([]);
    expect(await loadAdminLookup(env.DB, 'labels', 'zz-no-such-label')).toEqual([]);
  });
});

describe('batch and reindex cursor repositories', () => {
  it('runs statements in order as one batch and returns their results', async () => {
    const id = crypto.randomUUID();
    const results = await runBatch(env.DB, [
      env.DB.prepare('INSERT INTO redirect (fromPath, toPath, createdAt) VALUES (?, ?, ?)').bind(`/tapes/${id}`, '/tapes/after', 1),
      env.DB.prepare('SELECT toPath FROM redirect WHERE fromPath = ?').bind(`/tapes/${id}`),
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].meta.changes).toBe(1);
    expect(results[1].results).toEqual([{ toPath: '/tapes/after' }]);
  });

  it('rolls the whole batch back when one statement fails', async () => {
    const id = crypto.randomUUID();
    await expect(runBatch(env.DB, [
      env.DB.prepare('INSERT INTO redirect (fromPath, toPath, createdAt) VALUES (?, ?, ?)').bind(`/songs/${id}`, '/songs/after', 1),
      env.DB.prepare('INSERT INTO no_such_table (id) VALUES (?)').bind(id),
    ])).rejects.toThrow();
    expect(await env.DB.prepare('SELECT toPath FROM redirect WHERE fromPath = ?').bind(`/songs/${id}`).first()).toBeNull();
  });

  it('sets and clears the full-rebuild cursor', async () => {
    await setReindexCursor(env.DB, JSON.stringify(['tape', seeded.tapeIds[0]]));
    expect((await getReindexState(env.DB))?.reindexCursor).toBe(JSON.stringify(['tape', seeded.tapeIds[0]]));
    await setReindexCursor(env.DB, null);
    expect((await getReindexState(env.DB))?.reindexCursor).toBeNull();
  });
});
