import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { normalizeSearchField, parseAdvancedSearch } from '../../src/domain/search';
import { advancedSearch } from '../../src/repositories/search.repo';

describe('advanced public search', () => {
  it('bounds and normalizes filters', () => {
    const filters = parseAdvancedSearch(new URLSearchParams({ kind: 'invalid', q: ' x '.repeat(100), yearFrom: '1880', yearTo: '2020', releaseType: 'broken', cursor: '!invalid' }));
    expect(filters.kind).toBe('song');
    expect(filters.query.length).toBeLessThanOrEqual(100);
    expect(filters.yearFrom).toBeNull();
    expect(filters.yearTo).toBe(2020);
    expect(filters.releaseType).toBe('');
  });

  it('excludes private songs and draft tapes while supporting Thai search', async () => {
    const id = crypto.randomUUID();
    const title = `เพลงทดสอบ${id.slice(0, 8)}`;
    await env.DB.prepare("INSERT INTO song (id, slug, title, titleSort, isPublic, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, 1, 1)")
      .bind(id, id, title, title).run();
    await env.DB.prepare("INSERT INTO search_doc (kind, refId, isPublic, nameKey) VALUES ('song', ?, 1, ?)").bind(id, normalizeSearchField(title)).run();
    await env.DB.prepare("INSERT INTO search_fts (rowid, text) VALUES ((SELECT docId FROM search_doc WHERE kind = 'song' AND refId = ?), ?)").bind(id, normalizeSearchField(title)).run();
    const filters = parseAdvancedSearch(new URLSearchParams({ kind: 'song' }));
    const page = await advancedSearch(env.DB, { ...filters, query: title });
    expect(page.items.some(item => item.id === id)).toBe(true);
    await env.DB.prepare('UPDATE song SET isPublic = 0 WHERE id = ?').bind(id).run();
    expect((await advancedSearch(env.DB, { ...filters, query: title })).items.some(item => item.id === id)).toBe(false);

    const tapeId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO tape (id, slug, title, titleSort, releaseType, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'album', 'draft', 1, 1)")
      .bind(tapeId, tapeId, title, title).run();
    expect((await advancedSearch(env.DB, { ...filters, kind: 'tape', query: title })).items.some(item => item.id === tapeId)).toBe(false);
  });

  it('returns at most 20 records and a reusable cursor', async () => {
    const filters = parseAdvancedSearch(new URLSearchParams({ kind: 'song' }));
    const first = await advancedSearch(env.DB, filters);
    expect(first.items.length).toBeLessThanOrEqual(20);
    if (first.nextCursor) {
      const second = await advancedSearch(env.DB, { ...filters, cursor: first.nextCursor });
      expect(second.items.every(item => !first.items.some(previous => previous.id === item.id))).toBe(true);
    }
  });
});
