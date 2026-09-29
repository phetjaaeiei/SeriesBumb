import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createArtist, createLabel, createSong, createTapeDraft, saveArtist, saveLabel, saveTape } from '../../src/services/catalog';
import { searchPublic } from '../../src/repositories/search.repo';
import { enqueueFullReindex } from '../../src/services/search-admin';

describe('dependent search indexing', () => {
  it('finds a published tape and song by renamed artist, and a tape by renamed label', async () => {
    const userId = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').bind(userId, 'คนจัดการ', `${userId}@example.com`, now, now).run();
    const suffix = userId.slice(0, 8);
    const artist = await createArtist(env.DB, userId, `ศิลปินเก่า${suffix}`);
    const label = await createLabel(env.DB, userId, `ค่ายเก่า${suffix}`);
    const song = await createSong(env.DB, userId, { title: `เพลงทดสอบ${suffix}`, artistIds: [artist.id] });
    const tape = await createTapeDraft(env.DB, userId, `เทปทดสอบ${suffix}`);
    await env.DB.prepare("INSERT INTO tape_image (id, tapeId, kind, fullKey, thumbKey, width, height, bytes, position) VALUES (?, ?, 'front', 'f', 't', 100, 100, 2, 0)").bind(crypto.randomUUID(), tape.id).run();
    await saveTape(env.DB, userId, { id: tape.id, title: `เทปทดสอบ${suffix}`, releaseType: 'album', artistIds: [artist.id], labelId: label.id, tracks: [{ songId: song.id, side: 'A', position: 1 }], status: 'published' });
    await saveArtist(env.DB, userId, { id: artist.id, name: `ศิลปินใหม่${suffix}` });
    const renamedArtistResults = await searchPublic(env.DB, `ศิลปินใหม่${suffix}`);
    expect(renamedArtistResults.some(row => row.kind === 'tape')).toBe(true);
    expect(renamedArtistResults.some(row => row.kind === 'song')).toBe(true);
    await saveLabel(env.DB, userId, { id: label.id, name: `ค่ายใหม่${suffix}` });
    expect((await searchPublic(env.DB, `ค่ายใหม่${suffix}`)).some(row => row.kind === 'tape')).toBe(true);
    await saveLabel(env.DB, userId, { id: label.id, name: `ค่ายซีรี่ย์${suffix}` });
    expect((await searchPublic(env.DB, 'ค่ายซีรีย์')).some(row => row.kind === 'tape')).toBe(true);
    expect((await searchPublic(env.DB, 'ค่าย ซีรีย์')).some(row => row.kind === 'tape')).toBe(true);
    await env.DB.prepare("DELETE FROM search_fts WHERE rowid = (SELECT docId FROM search_doc WHERE kind = 'tape' AND refId = ?)").bind(tape.id).run();
    expect((await searchPublic(env.DB, `เทปทดสอบ${suffix}`)).some(row => row.kind === 'tape')).toBe(false);
    const rebuilt = await enqueueFullReindex(env.DB);
    expect(rebuilt.processed).toBeGreaterThan(0);
    expect((await searchPublic(env.DB, `เทปทดสอบ${suffix}`)).some(row => row.kind === 'tape')).toBe(true);
  });
});
