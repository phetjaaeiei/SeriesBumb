import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { addArtistRelation, addTapeEdition, publicArtistRelations, publicTapeEditions } from '../../src/lib/services/catalog-relations';
import { addCatalogSource } from '../../src/lib/services/catalog-sources';

describe('sourced catalog relations', () => {
  it('hides a draft edition and an artist without public catalog content', async () => {
    const now = Date.now();
    const userId = crypto.randomUUID();
    const a = crypto.randomUUID(), b = crypto.randomUUID(), t = crypto.randomUUID(), d = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').bind(userId, 'Admin', `${userId}@example.com`, now, now).run();
    for (const id of [a, b]) await env.DB.prepare("INSERT INTO artist (id, slug, name, nameSort, createdAt, updatedAt) VALUES (?, ?, 'ศิลปิน', 'ศิลปิน', ?, ?)").bind(id, id, now, now).run();
    for (const [id, status] of [[t, 'published'], [d, 'draft']]) await env.DB.prepare("INSERT INTO tape (id, slug, title, titleSort, releaseType, status, createdAt, updatedAt) VALUES (?, ?, 'เทป', 'เทป', 'album', ?, ?, ?)").bind(id, id, status, now, now).run();
    const artistSource = await addCatalogSource(env.DB, userId, { entityKind: 'artist', entityId: a, title: 'แหล่งศิลปิน', url: `https://example.org/artist/${a}`, claim: 'เชื่อมชื่อเดิม', accessedAt: now });
    const tapeSource = await addCatalogSource(env.DB, userId, { entityKind: 'tape', entityId: t, title: 'แหล่งเทป', url: `https://example.org/tape/${t}`, claim: 'ระบุฉบับออกใหม่', accessedAt: now });
    await expect(addArtistRelation(env.DB, a, b, 'former_name', tapeSource.id)).rejects.toThrow('ต้นทาง');
    await addArtistRelation(env.DB, a, b, 'former_name', artistSource.id);
    await addTapeEdition(env.DB, t, d, 'cassette', 1991, '', tapeSource.id);
    expect(await publicArtistRelations(env.DB, a)).toEqual([]);
    expect(await publicTapeEditions(env.DB, t)).toEqual([]);
    await env.DB.prepare('UPDATE artist SET publishedTapeCount = 1 WHERE id = ?').bind(b).run();
    await env.DB.prepare("UPDATE tape SET status = 'published' WHERE id = ?").bind(d).run();
    expect((await publicArtistRelations(env.DB, a)).map(row => row.slug)).toEqual([b]);
    expect((await publicTapeEditions(env.DB, t)).map(row => row.slug)).toEqual([d]);
  });
});
