import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createSong, createTapeDraft, saveTape } from '../../src/services/catalog';
import { setEngagement } from '../../src/services/engagement';

describe('engagement', () => {
  it('is idempotent and only accepts public records', async () => {
    const userId = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)')
      .bind(userId, 'สมาชิก', `${userId}@example.com`, now, now).run();
    const draft = await createTapeDraft(env.DB, userId, 'เทปทดลองถูกใจ');
    await expect(setEngagement(env.DB, userId, 'tapeLike', draft.id, true)).rejects.toThrow('ไม่พบรายการนี้');
    const song = await createSong(env.DB, userId, { title: `เพลง ${draft.id.slice(0, 8)}` });
    await expect(setEngagement(env.DB, userId, 'songLike', song.id, true)).rejects.toThrow('ไม่พบรายการนี้');
    await env.DB.prepare("INSERT INTO tape_image (id, tapeId, kind, fullKey, thumbKey, width, height, bytes, position) VALUES (?, ?, 'front', 'f', 't', 100, 100, 2, 0)").bind(crypto.randomUUID(), draft.id).run();
    await saveTape(env.DB, userId, { id: draft.id, title: 'เทปทดลองถูกใจ', releaseType: 'compilation', tracks: [{ songId: song.id, side: 'A', position: 1 }], status: 'published' });
    expect(await setEngagement(env.DB, userId, 'tapeLike', draft.id, true)).toEqual({ value: true, count: 1, changed: true });
    // Repeating the same state must not rewrite the counter row (D1 write quota).
    expect(await setEngagement(env.DB, userId, 'tapeLike', draft.id, true)).toEqual({ value: true, count: 1, changed: false });
    expect(await setEngagement(env.DB, userId, 'tapeOwned', draft.id, true)).toEqual({ value: true, count: 1, changed: true });
    expect(await setEngagement(env.DB, userId, 'songLike', song.id, true)).toEqual({ value: true, count: 1, changed: true });
    expect(await setEngagement(env.DB, userId, 'tapeLike', draft.id, false)).toEqual({ value: false, count: 0, changed: true });
    expect(await setEngagement(env.DB, userId, 'tapeLike', draft.id, false)).toEqual({ value: false, count: 0, changed: false });
  });

  it('keeps counters exact when several members toggle', async () => {
    const now = Date.now();
    const owner = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').bind(owner, 'แอดมิน', `${owner}@example.com`, now, now).run();
    const draft = await createTapeDraft(env.DB, owner, 'เทปนับถูกใจ');
    const song = await createSong(env.DB, owner, { title: `เพลงนับ ${draft.id.slice(0, 8)}` });
    await env.DB.prepare("INSERT INTO tape_image (id, tapeId, kind, fullKey, thumbKey, width, height, bytes, position) VALUES (?, ?, 'front', 'f', 't', 100, 100, 2, 0)").bind(crypto.randomUUID(), draft.id).run();
    await saveTape(env.DB, owner, { id: draft.id, title: 'เทปนับถูกใจ', releaseType: 'compilation', tracks: [{ songId: song.id, side: 'A', position: 1 }], status: 'published' });
    const members = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (const id of members) {
      await env.DB.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').bind(id, 'สมาชิก', `${id}@example.com`, now, now).run();
      await setEngagement(env.DB, id, 'tapeLike', draft.id, true);
    }
    await setEngagement(env.DB, members[1], 'tapeLike', draft.id, false);
    const row = await env.DB.prepare('SELECT likeCount, (SELECT COUNT(*) FROM tape_like WHERE tapeId = ?) AS actual FROM tape WHERE id = ?').bind(draft.id, draft.id).first<{ likeCount: number; actual: number }>();
    expect(row).toEqual({ likeCount: 2, actual: 2 });
  });
});
