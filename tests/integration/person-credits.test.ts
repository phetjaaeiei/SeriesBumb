import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { addCatalogSource } from '../../src/services/catalog-sources';
import { addPersonCredit, creditsForTarget, publicCreditsForPerson } from '../../src/services/person-credits';

describe('sourced person credits', () => {
  it('requires a source on the target and hides draft appearances', async () => {
    const now = Date.now();
    const userId = crypto.randomUUID(), personId = crypto.randomUUID(), tapeId = crypto.randomUUID(), songId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').bind(userId, 'Admin', `${userId}@example.com`, now, now).run();
    await env.DB.prepare('INSERT INTO person (id, slug, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)').bind(personId, personId, 'นักดนตรี', now, now).run();
    await env.DB.prepare("INSERT INTO tape (id, slug, title, titleSort, releaseType, status, createdAt, updatedAt) VALUES (?, ?, 'เทป', 'เทป', 'album', 'draft', ?, ?)").bind(tapeId, tapeId, now, now).run();
    await env.DB.prepare("INSERT INTO song (id, slug, title, titleSort, createdAt, updatedAt) VALUES (?, ?, 'เพลง', 'เพลง', ?, ?)").bind(songId, songId, now, now).run();
    const tapeSource = await addCatalogSource(env.DB, userId, { entityKind: 'tape', entityId: tapeId, title: 'ปกเทป', url: `https://example.org/${tapeId}`, claim: 'ชื่อผู้เรียบเรียง', accessedAt: now });
    const songSource = await addCatalogSource(env.DB, userId, { entityKind: 'song', entityId: songId, title: 'ปกเพลง', url: `https://example.org/${songId}`, claim: 'ชื่อผู้แต่ง', accessedAt: now });
    const credit = { personId, targetKind: 'tape' as const, targetId: tapeId, creditedAs: 'นักดนตรี', role: 'เรียบเรียง', sourceId: songSource.id };
    await expect(addPersonCredit(env.DB, credit)).rejects.toThrow('หลักฐาน');
    await addPersonCredit(env.DB, { ...credit, sourceId: tapeSource.id });
    await addPersonCredit(env.DB, { ...credit, targetKind: 'song', targetId: songId, sourceId: songSource.id });
    expect(await creditsForTarget(env.DB, 'tape', tapeId)).toHaveLength(1);
    expect(await publicCreditsForPerson(env.DB, personId)).toHaveLength(0);
    await env.DB.prepare("UPDATE tape SET status = 'published' WHERE id = ?").bind(tapeId).run();
    await env.DB.prepare('UPDATE song SET isPublic = 1 WHERE id = ?').bind(songId).run();
    expect(await publicCreditsForPerson(env.DB, personId)).toHaveLength(2);
  });
});
