import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { randomPublicArtist } from '../../src/lib/queries/random-artist';

describe('random artist', () => {
  it('never selects an artist without a public song or tape', async () => {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO artist (id, slug, name, nameSort, createdAt, updatedAt) VALUES (?, ?, 'ศิลปินร่าง', 'ศิลปินร่าง', 1, 1)").bind(id, id).run();
    for (const sample of [0, 0.5, 0.999]) expect(await randomPublicArtist(env.DB, () => sample)).not.toBe(id);
  });
});
