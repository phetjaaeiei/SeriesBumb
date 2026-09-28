import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createTapeDraft, saveTape } from '../../src/services/catalog';
import { deleteTapeImage } from '../../src/services/images';
import { MemoryImageStore } from './helpers/image-store';

describe('tape image deletion', () => {
  it('removes objects and recalculates the cover while preserving a published tape cover', async () => {
    const store = new MemoryImageStore();
    const userId = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)')
      .bind(userId, 'ผู้ทดสอบรูป', `${userId}@example.com`, now, now).run();
    const draft = await createTapeDraft(env.DB, userId, 'เทปทดสอบรูป');
    const imageId = crypto.randomUUID();
    const key = `tapes/${draft.id}/${imageId}-full.webp`;
    const thumbKey = `tapes/${draft.id}/${imageId}-thumb.webp`;
    await store.put(key, new Uint8Array([1, 2, 3]));
    await store.put(thumbKey, new Uint8Array([1]));
    await env.DB.prepare("INSERT INTO tape_image (id, tapeId, kind, fullKey, thumbKey, width, height, bytes, position) VALUES (?, ?, 'front', ?, ?, 100, 100, 4, 0)")
      .bind(imageId, draft.id, key, thumbKey).run();
    await env.DB.prepare('UPDATE site_stats SET imageBytes = imageBytes + 4 WHERE id = 1').run();
    const pending: Promise<unknown>[] = [];
    await deleteTapeImage(env.DB, store, imageId, promise => pending.push(promise));
    await Promise.all(pending);
    expect(await store.head(key)).toBeNull();
    expect(await env.DB.prepare('SELECT id FROM tape_image WHERE id = ?').bind(imageId).first()).toBeNull();
    expect((await env.DB.prepare('SELECT coverImageId FROM tape WHERE id = ?').bind(draft.id).first<{ coverImageId: string | null }>())?.coverImageId).toBeNull();

    const secondId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO tape_image (id, tapeId, kind, fullKey, thumbKey, width, height, bytes, position) VALUES (?, ?, 'front', ?, ?, 100, 100, 4, 0)")
      .bind(secondId, draft.id, `tapes/${draft.id}/second-full.webp`, `tapes/${draft.id}/second-thumb.webp`).run();
    await saveTape(env.DB, userId, { id: draft.id, title: 'เทปทดสอบรูป', releaseType: 'compilation', status: 'published' });
    await expect(deleteTapeImage(env.DB, store, secondId, () => {})).rejects.toThrow('อย่างน้อยหนึ่งรูป');
  });
});
