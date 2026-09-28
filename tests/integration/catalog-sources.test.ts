import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { addCatalogSource, deleteCatalogSource, listCatalogSources, validateSourceUrl } from '../../src/services/catalog-sources';

describe('catalog sources', () => {
  it('accepts public HTTPS URLs and rejects unsafe schemes', () => {
    expect(validateSourceUrl('https://example.org/release')).toBe('https://example.org/release');
    expect(() => validateSourceUrl('javascript:alert(1)')).toThrow();
    expect(() => validateSourceUrl('http://example.org')).toThrow();
    expect(() => validateSourceUrl('https://localhost/private')).toThrow();
  });

  it('stores an exact claim for an existing artist and can remove it', async () => {
    const adminId = crypto.randomUUID();
    const artistId = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').bind(adminId, 'Admin', `${adminId}@example.com`, now, now).run();
    await env.DB.prepare("INSERT INTO artist (id, slug, name, nameSort, createdAt, updatedAt) VALUES (?, ?, 'ทดสอบ', 'ทดสอบ', ?, ?)").bind(artistId, artistId, now, now).run();
    const source = await addCatalogSource(env.DB, adminId, { entityKind: 'artist', entityId: artistId, title: 'หน้าประวัติ', url: `https://example.org/${artistId}`, claim: 'ระบุชื่อวง', accessedAt: now });
    expect((await listCatalogSources(env.DB, 'artist', artistId))[0]).toMatchObject({ id: source.id, claim: 'ระบุชื่อวง' });
    expect(await listCatalogSources(env.DB, 'tape', artistId)).toEqual([]);
    await deleteCatalogSource(env.DB, source.id);
    expect(await listCatalogSources(env.DB, 'artist', artistId)).toEqual([]);
  });
});
