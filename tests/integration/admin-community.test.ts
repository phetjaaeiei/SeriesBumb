import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { moderateComment, setCommentBan, setUserRole } from '../../src/lib/services/admin-community';
import { createTapeDraft, saveTape } from '../../src/lib/services/catalog';
import { createComment, deleteOwnComment } from '../../src/lib/services/comments';

describe('admin community controls', () => {
  it('protects bootstrap and self roles, bans members, and moderates comments', async () => {
    const adminId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare("INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt) VALUES (?, 'Admin', ?, 1, 'admin', ?, ?)").bind(adminId, 'bootstrap@example.com', now, now).run();
    await env.DB.prepare("INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt) VALUES (?, 'Member', ?, 1, 'member', ?, ?)").bind(memberId, `${memberId}@example.com`, now, now).run();
    await expect(setUserRole(env.DB, adminId, adminId, 'member', 'bootstrap@example.com')).rejects.toThrow('ตัวเอง');
    await expect(setCommentBan(env.DB, adminId, true)).rejects.toThrow('แอดมิน');
    expect(await setUserRole(env.DB, adminId, memberId, 'admin', 'bootstrap@example.com')).toEqual({ id: memberId, role: 'admin' });
    expect(await setUserRole(env.DB, adminId, memberId, 'member', 'bootstrap@example.com')).toEqual({ id: memberId, role: 'member' });
    expect(await setCommentBan(env.DB, memberId, true)).toEqual({ id: memberId, banned: true });
    await setCommentBan(env.DB, memberId, false);

    const draft = await createTapeDraft(env.DB, adminId, 'เทปทดสอบแอดมิน');
    await env.DB.prepare("INSERT INTO tape_image (id, tapeId, kind, fullKey, thumbKey, width, height, bytes, position) VALUES (?, ?, 'front', 'f', 't', 100, 100, 2, 0)").bind(crypto.randomUUID(), draft.id).run();
    await saveTape(env.DB, adminId, { id: draft.id, title: 'เทปทดสอบแอดมิน', releaseType: 'compilation', status: 'published' });
    const comment = await createComment(env.DB, memberId, 'member', { tapeId: draft.id }, 'ฝากข้อความ');
    expect(await moderateComment(env.DB, adminId, comment.id, false)).toEqual({ id: comment.id, deleted: true });
    expect((await env.DB.prepare('SELECT commentCount FROM tape WHERE id = ?').bind(draft.id).first<{ commentCount: number }>())?.commentCount).toBe(0);
    expect(await moderateComment(env.DB, adminId, comment.id, true)).toEqual({ id: comment.id, deleted: false });
    expect((await env.DB.prepare('SELECT commentCount FROM tape WHERE id = ?').bind(draft.id).first<{ commentCount: number }>())?.commentCount).toBe(1);

    const own = await createComment(env.DB, memberId, 'member', { tapeId: draft.id }, 'ลบเอง');
    await deleteOwnComment(env.DB, memberId, own.id);
    await setUserRole(env.DB, adminId, memberId, 'admin', 'bootstrap@example.com');
    await expect(moderateComment(env.DB, adminId, own.id, true)).rejects.toThrow('เฉพาะคอมเมนต์ที่แอดมินลบ');

    const adminComment = await createComment(env.DB, adminId, 'admin', { tapeId: draft.id }, 'คอมเมนต์จากแอดมิน');
    await moderateComment(env.DB, memberId, adminComment.id, false);
    await setUserRole(env.DB, adminId, memberId, 'member', 'bootstrap@example.com');
    expect(await moderateComment(env.DB, adminId, adminComment.id, true)).toEqual({ id: adminComment.id, deleted: false });
  });
});
