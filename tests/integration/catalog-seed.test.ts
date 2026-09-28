import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { SEED_SIZES, seedCatalog } from '../fixtures/catalog-seed';

describe('catalog seed', () => {
  it('builds a published catalog through the real services', async () => {
    const seeded = await seedCatalog(env.DB, SEED_SIZES.parity);
    const counts = await env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM tape WHERE status = 'published') AS published,
      (SELECT COUNT(*) FROM tape WHERE status = 'draft') AS drafts,
      (SELECT COUNT(*) FROM search_queue) AS queued,
      (SELECT COUNT(*) FROM review WHERE status = 'published') AS reviews,
      (SELECT publishedTapeCount FROM site_stats WHERE id = 1) AS statsTapes`).first<Record<string, number>>();
    expect(seeded.tapeIds).toHaveLength(SEED_SIZES.parity.tapes);
    expect(counts).toMatchObject({ published: 30, drafts: 6, queued: 0, reviews: 1 });
    expect(counts?.statsTapes).toBeGreaterThanOrEqual(30);
  });
});
