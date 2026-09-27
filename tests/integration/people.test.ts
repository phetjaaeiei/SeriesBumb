import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createArtist, saveArtist } from '../../src/lib/services/catalog';
import { addCatalogSource } from '../../src/lib/services/catalog-sources';
import { createPerson, linkArtistMember } from '../../src/lib/services/people';

describe('verified person identity', () => {
  it('requires a source from the same artist and preserves links across profile edits', async () => {
    const userId = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').bind(userId, 'Admin', `${userId}@example.com`, now, now).run();
    const artist = await createArtist(env.DB, userId, `วงทดสอบ${userId.slice(0, 8)}`);
    await saveArtist(env.DB, userId, { id: artist.id, name: `วงทดสอบ${userId.slice(0, 8)}`, members: [{ name: 'นักดนตรีหนึ่ง', role: 'กีตาร์', isCurrent: true }] });
    const member = await env.DB.prepare('SELECT id FROM artist_member WHERE artistId = ?').bind(artist.id).first<{ id: string }>();
    const person = await createPerson(env.DB, `นักดนตรีทดสอบ${userId.slice(0, 8)}`);
    await expect(linkArtistMember(env.DB, member!.id, person.id, null)).rejects.toThrow('แหล่งอ้างอิง');
    const source = await addCatalogSource(env.DB, userId, { entityKind: 'artist', entityId: artist.id, title: 'หลักฐานสมาชิก', url: `https://example.org/${artist.id}`, claim: 'ระบุชื่อและหน้าที่', accessedAt: now });
    await linkArtistMember(env.DB, member!.id, person.id, source.id);
    await saveArtist(env.DB, userId, { id: artist.id, name: `วงทดสอบ${userId.slice(0, 8)}`, members: [{ id: member!.id, name: 'นักดนตรีหนึ่ง', role: 'กีตาร์', isCurrent: false }] });
    expect(await env.DB.prepare('SELECT personId, sourceId FROM artist_member WHERE id = ?').bind(member!.id).first()).toMatchObject({ personId: person.id, sourceId: source.id });
    await linkArtistMember(env.DB, member!.id, null, null);
    expect((await env.DB.prepare('SELECT personId FROM artist_member WHERE id = ?').bind(member!.id).first<{ personId: string | null }>())?.personId).toBeNull();
  });
});
