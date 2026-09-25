import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createSong, createTapeDraft, saveTape } from '../../src/lib/services/catalog';
import { setEngagement } from '../../src/lib/services/engagement';

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
    expect(await setEngagement(env.DB, userId, 'tapeLike', draft.id, true)).toEqual({ value: true, count: 1 });
    expect(await setEngagement(env.DB, userId, 'tapeLike', draft.id, true)).toEqual({ value: true, count: 1 });
    expect(await setEngagement(env.DB, userId, 'tapeOwned', draft.id, true)).toEqual({ value: true, count: 1 });
    expect(await setEngagement(env.DB, userId, 'songLike', song.id, true)).toEqual({ value: true, count: 1 });
    expect(await setEngagement(env.DB, userId, 'tapeLike', draft.id, false)).toEqual({ value: false, count: 0 });
  });
});
