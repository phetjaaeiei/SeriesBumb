import { env } from 'cloudflare:workers';
import type { APIContext } from 'astro';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_LIMITS, audioUsage, deleteAudio, downloadAudio, listAudio, reserveAudio, reserveDownload, uploadAudio, type AudioEnvironment } from '../../src/lib/services/audio-archive';
import { SupabaseAudioStore, type AudioStore } from '../../src/lib/services/audio-store';
import { GET as listRoute, POST as reserveRoute } from '../../src/pages/admin/api/audio/index';
import { GET as downloadRoute, DELETE as deleteRoute } from '../../src/pages/admin/api/audio/[id]/index';
import { PUT as uploadRoute } from '../../src/pages/admin/api/audio/[id]/upload';

const configured: AudioEnvironment = { ...env, SUPABASE_URL: 'https://archive-test.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', SUPABASE_AUDIO_BUCKET: 'SeriesBumb' };
let userId: string;
const audio = new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 0, 1, 2]);
const details = (size = audio.length) => ({ title: 'เทปเก่า', provider: 'supabase', filename: 'เพลง.mp3', size, contentType: 'audio/mpeg' });
const inputRequest = (bytes = audio) => new Request('http://localhost:4321/admin/api/audio/upload', { method: 'PUT', body: bytes, headers: { 'Content-Type': 'audio/mpeg' } });
function fakeStore(): AudioStore {
  return { put: vi.fn(async (_key, body) => { await new Response(body).arrayBuffer(); }), get: vi.fn(async () => ({ body: new Response(audio).body!, size: audio.length })), delete: vi.fn(async () => undefined) };
}

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM audio_file'), env.DB.prepare('DELETE FROM audio_download_usage')]);
  userId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO user (id,name,email,emailVerified,role,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)').bind(userId, 'Admin', `${userId}@example.test`, 1, 'admin', Date.now(), Date.now()).run();
});

describe('private audio reservations', () => {
  it('calls the global fetch with its native receiver rather than binding it to the store', async () => {
    vi.stubGlobal('fetch', function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(new Response(audio, { headers: { 'Content-Length': String(audio.length) } }));
    });
    try {
      const store = new SupabaseAudioStore(configured.SUPABASE_URL!, configured.SUPABASE_SECRET_KEY!, configured.SUPABASE_AUDIO_BUCKET!);
      const result = await store.get('audio/test.mp3');
      expect(result?.size).toBe(audio.length);
      await result?.body.cancel();
    } finally { vi.unstubAllGlobals(); }
  });

  it('serializes simultaneous reservations at the storage limit including pending uploads', async () => {
    const { file } = await reserveAudio(configured, details(), userId);
    await env.DB.prepare('UPDATE audio_file SET size = ? WHERE id = ?').bind(AUDIO_LIMITS.supabase.storage - 20, file.id).run();
    const results = await Promise.allSettled([reserveAudio(configured, details(20), userId), reserveAudio(configured, details(20), userId)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await audioUsage(configured))[0].reservedBytes).toBe(AUDIO_LIMITS.supabase.storage);
  });

  it('rejects oversized files and Firebase while its switch is disabled', async () => {
    await expect(reserveAudio(configured, details(50_000_001), userId)).rejects.toMatchObject({ status: 413 });
    await expect(reserveAudio({ ...configured, FIREBASE_STORAGE_BUCKET: 'test', FIREBASE_SERVICE_ACCOUNT_JSON: '{}' }, { ...details(), provider: 'firebase' }, userId)).rejects.toMatchObject({ status: 503 });
    expect((await listAudio(configured)).files).toHaveLength(0);
  });

  it('streams valid uploads and locks against a second upload or concurrent delete', async () => {
    const { file } = await reserveAudio(configured, details(), userId);
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const store = fakeStore();
    store.put = vi.fn(async (_key, body) => { entered(); await waiting; await new Response(body).arrayBuffer(); });
    const upload = uploadAudio(configured, file.id, inputRequest(), () => store);
    await started;
    await expect(uploadAudio(configured, file.id, inputRequest(), () => store)).rejects.toMatchObject({ status: 409 });
    await expect(deleteAudio(configured, file.id, () => store)).rejects.toMatchObject({ status: 409 });
    release();
    expect((await upload).status).toBe('ready');
    const usage = (await audioUsage(configured))[0];
    expect(usage.usedBytes).toBe(audio.length);
    expect(usage.reservedBytes).toBe(0);
  });

  it('rejects mismatched headers, signatures and streamed size; keeps failed reservations', async () => {
    const store = fakeStore();
    const first = (await reserveAudio(configured, details(), userId)).file;
    const wrongLength = inputRequest();
    wrongLength.headers.set('Content-Length', '13');
    await expect(uploadAudio(configured, first.id, wrongLength, () => store)).rejects.toMatchObject({ status: 400 });
    const invalidSignature = new Uint8Array(audio.length).fill(60);
    await expect(uploadAudio(configured, first.id, inputRequest(invalidSignature), () => store)).rejects.toMatchObject({ status: 400 });
    expect(store.put).not.toHaveBeenCalled();
    const second = (await reserveAudio(configured, details(audio.length + 1), userId)).file;
    await expect(uploadAudio(configured, second.id, inputRequest(), () => store)).rejects.toMatchObject({ status: 400 });
    const third = (await reserveAudio(configured, details(), userId)).file;
    await expect(uploadAudio(configured, third.id, inputRequest(new Uint8Array([...audio, 5])), () => store)).rejects.toMatchObject({ status: 413 });
    const files = (await listAudio(configured)).files;
    expect(files.every(file => file.status === 'failed')).toBe(true);
    expect((await audioUsage(configured))[0].reservedBytes).toBe(audio.length * 3 + 1);
  });

  it('does not free bytes when remote deletion is uncertain and permits retry', async () => {
    const { file } = await reserveAudio(configured, details(), userId);
    const store = fakeStore();
    store.delete = vi.fn(async () => { throw new Error('timeout'); });
    await expect(deleteAudio(configured, file.id, () => store)).rejects.toThrow('timeout');
    expect((await audioUsage(configured))[0].reservedBytes).toBe(audio.length);
    expect((await listAudio(configured)).files[0].status).toBe('deleting');
    store.delete = vi.fn(async () => undefined);
    await deleteAudio(configured, file.id, () => store);
    expect((await audioUsage(configured))[0].reservedBytes).toBe(0);
  });

  it('recovers a stale uploading record only after the request deadline safety window', async () => {
    const { file } = await reserveAudio(configured, details(), userId);
    await env.DB.prepare("UPDATE audio_file SET status = 'uploading', updatedAt = ? WHERE id = ?").bind(Date.now() - 16 * 60_000, file.id).run();
    const store = fakeStore();
    await deleteAudio(configured, file.id, () => store);
    expect(store.delete).toHaveBeenCalledOnce();
    expect((await listAudio(configured)).files).toHaveLength(0);
  });

  it('enforces Drive restricted-sharing acknowledgement and canonical file URLs', async () => {
    const input = { title: 'เทปหน้า A', provider: 'drive', driveUrl: 'https://drive.google.com/file/d/abcdefghijklmnop/view?usp=sharing' };
    await expect(reserveAudio(configured, input, userId)).rejects.toMatchObject({ status: 400 });
    const { file, uploadUrl } = await reserveAudio(configured, { ...input, driveRestrictedConfirmed: true }, userId);
    expect(file).toMatchObject({ size: 0, status: 'ready', filename: input.title, driveUrl: 'https://drive.google.com/file/d/abcdefghijklmnop/view' });
    expect(uploadUrl).toBeUndefined();
    expect((await downloadAudio(configured, file.id)).headers.get('Location')).toBe(file.driveUrl);
    for (const driveUrl of ['https://drive.google.com.evil.test/file/d/abcdefghijklmnop/view', 'https://drive.google.com/drive/folders/abcdefghijklmnop', 'javascript:alert(1)', 'https://user:pw@drive.google.com/file/d/abcdefghijklmnop/view']) {
      await expect(reserveAudio(configured, { ...input, driveUrl, driveRestrictedConfirmed: true }, userId)).rejects.toMatchObject({ status: 400 });
    }
  });
});

describe('audio download quotas', () => {
  it('retains prior calendar-month usage for 32 UTC dates and expires only older buckets', async () => {
    const dayAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO audio_download_usage (provider,day,bytes,requests) VALUES (?,?,?,?)').bind('supabase', dayAgo(31), AUDIO_LIMITS.supabase.downloads - audio.length, 1),
      env.DB.prepare('INSERT INTO audio_download_usage (provider,day,bytes,requests) VALUES (?,?,?,?)').bind('supabase', dayAgo(32), AUDIO_LIMITS.supabase.downloads, 1),
    ]);
    expect((await audioUsage(configured))[0].downloadBytes).toBe(AUDIO_LIMITS.supabase.downloads - audio.length);
    const results = await Promise.allSettled([reserveDownload(configured, 'supabase', audio.length), reserveDownload(configured, 'supabase', audio.length)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await audioUsage(configured))[0].downloadBytes).toBe(AUDIO_LIMITS.supabase.downloads);
  });

  it('applies the request-count guard to the same rolling window', async () => {
    await env.DB.prepare('INSERT INTO audio_download_usage (provider,day,bytes,requests) VALUES (?,?,?,?)')
      .bind('supabase', new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10), audio.length, AUDIO_LIMITS.supabase.requests).run();
    await expect(reserveDownload(configured, 'supabase', audio.length)).rejects.toMatchObject({ status: 429 });
  });

  it('atomically blocks concurrent downloads at the rolling byte limit', async () => {
    await env.DB.prepare('INSERT INTO audio_download_usage (provider,day,bytes,requests) VALUES (?,?,?,?)').bind('supabase', new Date().toISOString().slice(0, 10), AUDIO_LIMITS.supabase.downloads - audio.length, 1).run();
    const results = await Promise.allSettled([reserveDownload(configured, 'supabase', audio.length), reserveDownload(configured, 'supabase', audio.length)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await audioUsage(configured))[0].downloadBytes).toBe(AUDIO_LIMITS.supabase.downloads);
  });

  it('reserves before remote fetch and keeps accounting for failed downloads', async () => {
    const { file } = await reserveAudio(configured, details(), userId);
    const store = fakeStore();
    await uploadAudio(configured, file.id, inputRequest(), () => store);
    store.get = vi.fn(async () => { throw new Error('remote unavailable'); });
    await expect(downloadAudio(configured, file.id, () => store)).rejects.toThrow('remote unavailable');
    expect((await audioUsage(configured))[0].downloadBytes).toBe(audio.length);
    await env.DB.prepare('UPDATE audio_download_usage SET bytes = ?').bind(AUDIO_LIMITS.supabase.downloads).run();
    await expect(downloadAudio(configured, file.id, () => store)).rejects.toMatchObject({ status: 429 });
    expect(store.get).toHaveBeenCalledOnce();
  });

  it('serves only private attachment responses with bounded streams', async () => {
    const { file } = await reserveAudio(configured, details(), userId);
    const store = fakeStore();
    await uploadAudio(configured, file.id, inputRequest(), () => store);
    const response = await downloadAudio(configured, file.id, () => store);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Content-Disposition')).toContain('attachment;');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(audio);
    expect((await listAudio(configured)).files[0]).not.toHaveProperty('objectKey');
  });
});

describe('direct audio REST authorization', () => {
  const routes = [listRoute, reserveRoute, downloadRoute, deleteRoute, uploadRoute];
  function context(role: 'admin' | 'member' | null, withSession: boolean, origin = 'http://localhost:4321'): APIContext {
    return {
      locals: { user: role ? { id: userId, role, name: 'User', email: 'user@example.test', image: null, commentBanned: false } : null, session: withSession ? { id: 'test-session', expiresAt: new Date(Date.now() + 60_000) } : null },
      request: new Request('http://localhost:4321/admin/api/audio', { headers: { Origin: origin } }), params: {},
    } as APIContext;
  }
  it('rejects every direct handler for anonymous callers, missing sessions and members', async () => {
    for (const route of routes) {
      for (const ctx of [context(null, false), context('admin', false), context('member', true)]) {
        const response = await route(ctx);
        expect(response.status).toBe(ctx.locals.user?.role === 'member' ? 403 : 401);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      }
    }
  });
  it('rejects same-session cross-origin calls and mutations with missing origin', async () => {
    for (const route of routes) expect((await route(context('admin', true, 'https://evil.example'))).status).toBe(403);
    for (const route of [reserveRoute, deleteRoute, uploadRoute]) {
      const ctx = context('admin', true);
      ctx.request.headers.delete('Origin');
      expect((await route(ctx)).status).toBe(403);
    }
  });
});
