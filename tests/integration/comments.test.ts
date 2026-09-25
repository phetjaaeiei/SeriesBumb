import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createTapeDraft, saveTape } from '../../src/lib/services/catalog';
import { createComment, deleteOwnComment, listComments } from '../../src/lib/services/comments';

describe('comments', () => {
  it('normalizes content, counts visible comments, enforces ownership and rate limits', async () => {
    const authorId = crypto.randomUUID();
    const otherId = crypto.randomUUID();
    const now = Date.now();
    for (const id of [authorId, otherId]) await env.DB.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').bind(id, `ผู้ใช้ ${id.slice(0, 4)}`, `${id}@example.com`, now, now).run();
    const draft = await createTapeDraft(env.DB, authorId, 'เทปคอมเมนต์');
    await expect(createComment(env.DB, authorId, 'member', { tapeId: draft.id }, 'ก่อนเผยแพร่')).rejects.toThrow('ไม่พบรายการนี้');
    await env.DB.prepare("INSERT INTO tape_image (id, tapeId, kind, fullKey, thumbKey, width, height, bytes, position) VALUES (?, ?, 'front', 'f', 't', 100, 100, 2, 0)").bind(crypto.randomUUID(), draft.id).run();
    await saveTape(env.DB, authorId, { id: draft.id, title: 'เทปคอมเมนต์', releaseType: 'compilation', status: 'published' });
    const first = await createComment(env.DB, authorId, 'member', { tapeId: draft.id }, '  สวัสดี\u202eโลก\n\n\n\n  ');
    expect(first.body).toBe('สวัสดีโลก');
    expect(first.isMine).toBe(true);
    expect(JSON.stringify(first)).not.toContain('@example.com');
    expect((await listComments(env.DB, { tapeId: draft.id }, null, otherId)).items[0].isMine).toBe(false);
    await expect(deleteOwnComment(env.DB, otherId, first.id)).rejects.toThrow('ไม่พบคอมเมนต์นี้');
    await deleteOwnComment(env.DB, authorId, first.id);
    expect((await listComments(env.DB, { tapeId: draft.id })).items).toHaveLength(0);
    expect((await env.DB.prepare('SELECT commentCount FROM tape WHERE id = ?').bind(draft.id).first<{ commentCount: number }>())?.commentCount).toBe(0);
    for (let index = 0; index < 4; index++) await createComment(env.DB, authorId, 'member', { tapeId: draft.id }, `ข้อความ ${index}`);
    await expect(createComment(env.DB, authorId, 'member', { tapeId: draft.id }, 'เกินจำนวน')).rejects.toThrow('คอมเมนต์ถี่เกินไป');
    await env.DB.prepare('UPDATE user SET commentBanned = 1 WHERE id = ?').bind(authorId).run();
    await expect(createComment(env.DB, authorId, 'member', { tapeId: draft.id }, 'หลังแบน')).rejects.toThrow('ถูกระงับ');
  });
});
