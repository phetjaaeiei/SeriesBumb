import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { moderateCorrection, moderateReview, submitCorrection, submitReview } from '../../src/services/reviews';

describe('moderated contributions', () => {
  it('holds a review and correction for moderation, rejects duplicates and banned members', async () => {
    const adminId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const tapeId = crypto.randomUUID();
    const draftId = crypto.randomUUID();
    const now = Date.now();
    for (const id of [adminId, memberId]) await env.DB.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').bind(id, 'สมาชิกทดสอบ', `${id}@example.com`, now, now).run();
    await env.DB.prepare("INSERT INTO tape (id, slug, title, titleSort, releaseType, status, createdAt, updatedAt) VALUES (?, ?, 'เทปทดสอบ', 'เทปทดสอบ', 'album', 'published', ?, ?)").bind(tapeId, tapeId, now, now).run();
    await env.DB.prepare("INSERT INTO tape (id, slug, title, titleSort, releaseType, status, createdAt, updatedAt) VALUES (?, ?, 'เทปร่าง', 'เทปร่าง', 'album', 'draft', ?, ?)").bind(draftId, draftId, now, now).run();
    const body = 'รีวิวจากสมาชิกที่อธิบายประสบการณ์ฟังและรายละเอียดการเรียบเรียงเพลงในเทปชุดนี้อย่างครบถ้วนมากกว่าแปดสิบตัวอักษร';
    await expect(submitReview(env.DB, memberId, draftId, 5, body)).rejects.toThrow('ไม่พบเทป');
    const review = await submitReview(env.DB, memberId, tapeId, 4, body);
    expect(review.status).toBe('pending');
    await expect(submitReview(env.DB, memberId, tapeId, 4, body)).rejects.toThrow();
    const stored = await env.DB.prepare('SELECT status FROM review WHERE id = ?').bind(review.id).first<{ status: string }>();
    expect(stored?.status).toBe('pending');
    await moderateReview(env.DB, adminId, review.id, 'published');
    expect((await env.DB.prepare('SELECT status FROM review WHERE id = ?').bind(review.id).first<{ status: string }>())?.status).toBe('published');

    const correction = await submitCorrection(env.DB, memberId, 'tape', tapeId, 'ขอแก้ปีที่ออกตามข้อมูลจากปกหลังตลับเทป', 'https://example.org/source');
    expect(correction.status).toBe('pending');
    await moderateCorrection(env.DB, adminId, correction.id, 'accepted');
    expect((await env.DB.prepare('SELECT status FROM catalog_submission WHERE id = ?').bind(correction.id).first<{ status: string }>())?.status).toBe('accepted');
    await env.DB.prepare('UPDATE user SET commentBanned = 1 WHERE id = ?').bind(memberId).run();
    await expect(submitCorrection(env.DB, memberId, 'tape', tapeId, 'ต้องตรวจชื่อเพลงและลำดับหน้าเทปอีกครั้ง')).rejects.toThrow('ระงับ');
  });
});
