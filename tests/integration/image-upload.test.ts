import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createArtist, createTapeDraft, saveTape } from '../../src/lib/services/catalog';
import { uploadImage } from '../../src/lib/services/images';
import { MemoryImageStore } from './helpers/image-store';

const webpBytes = new TextEncoder().encode('RIFF1234WEBPVP8 ');
const file = () => new File([webpBytes], 'cover.webp', { type: 'image/webp' });

describe('image upload', () => {
  it('requires a full image before a thumbnail and stores both keys in D1', async () => {
    const store = new MemoryImageStore();
    const userId = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').bind(userId, 'รูปเทป', `${userId}@example.com`, now, now).run();
    const tape = await createTapeDraft(env.DB, userId, 'เทปอัปโหลดรูป');
    const uuid = crypto.randomUUID();
    await expect(uploadImage(env.DB, store, { entityType: 'tapes', entityId: tape.id, variant: 'thumb', uuid, width: 400, height: 400, file: file() })).rejects.toThrow('รูปเต็ม');
    const full = await uploadImage(env.DB, store, { entityType: 'tapes', entityId: tape.id, variant: 'full', file: file() });
    const thumb = await uploadImage(env.DB, store, { entityType: 'tapes', entityId: tape.id, variant: 'thumb', uuid: full.uuid, kind: 'front', width: 400, height: 400, file: file() });
    expect(thumb.fullKey).toBe(full.key);
    expect(await store.head(thumb.thumbKey!)).not.toBeNull();
    const cover = await env.DB.prepare('SELECT coverImageId, coverThumbKey FROM tape WHERE id = ?').bind(tape.id).first<{ coverImageId: string | null; coverThumbKey: string | null }>();
    expect(cover?.coverImageId).toBe(thumb.imageId);
    expect(cover?.coverThumbKey).toBe(thumb.thumbKey);
    await saveTape(env.DB, userId, { id: tape.id, title: 'เทปอัปโหลดรูป', releaseType: 'compilation', status: 'published' });
    const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'share.jpg', { type: 'image/jpeg' });
    const beforeOg = (await env.DB.prepare('SELECT imageBytes FROM site_stats WHERE id = 1').first<{ imageBytes: number }>())!.imageBytes;
    const og = await uploadImage(env.DB, store, { entityType: 'tapes', entityId: tape.id, variant: 'og', file: jpeg() });
    expect((await env.DB.prepare('SELECT imageBytes FROM site_stats WHERE id = 1').first<{ imageBytes: number }>())?.imageBytes).toBe(beforeOg);
    await saveTape(env.DB, userId, { id: tape.id, title: 'เทปอัปโหลดรูป', releaseType: 'compilation', status: 'published', ogImageKey: og.key, ogSourceImageId: thumb.imageId, ogSourceTitle: 'เทปอัปโหลดรูป' }, store);
    const savedOg = await env.DB.prepare('SELECT ogImageKey, ogSourceImageId, ogSourceTitle, ogImageBytes FROM tape WHERE id = ?').bind(tape.id).first<{ ogImageKey: string | null; ogSourceImageId: string | null; ogSourceTitle: string | null; ogImageBytes: number }>();
    expect(savedOg).toMatchObject({ ogImageKey: og.key, ogSourceImageId: thumb.imageId, ogSourceTitle: 'เทปอัปโหลดรูป', ogImageBytes: 4 });
    expect((await env.DB.prepare('SELECT imageBytes FROM site_stats WHERE id = 1').first<{ imageBytes: number }>())?.imageBytes).toBe(beforeOg + 4);
    await saveTape(env.DB, userId, { id: tape.id, title: 'เทปอัปโหลดรูป', releaseType: 'compilation', status: 'published', ogImageKey: null }, store);
    expect(await store.head(og.key)).toBeNull();
    const artist = await createArtist(env.DB, userId, 'ศิลปินมีรูป');
    const artistFull = await uploadImage(env.DB, store, { entityType: 'artists', entityId: artist.id, variant: 'full', file: file() });
    await uploadImage(env.DB, store, { entityType: 'artists', entityId: artist.id, variant: 'thumb', uuid: artistFull.uuid, width: 400, height: 400, file: file() });
    expect((await env.DB.prepare('SELECT imageKey FROM artist WHERE id = ?').bind(artist.id).first<{ imageKey: string | null }>())?.imageKey).toBe(artistFull.key);
  });
});
