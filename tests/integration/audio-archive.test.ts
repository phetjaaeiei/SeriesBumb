import { env } from 'cloudflare:workers';
import type { APIContext } from 'astro';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_LIMITS, audioUsage, deleteAudio, downloadAudio, finalizeAudio, listAudio, reserveAudio, reserveDownload, signAudio, uploadAudio, type AudioEnvironment } from '../../src/lib/services/audio-archive';
import { SupabaseAudioStore, type AudioStore, type DirectAudioStore } from '../../src/lib/services/audio-store';
import { GET as listRoute, POST as reserveRoute } from '../../src/pages/admin/api/audio/index';
import { GET as downloadRoute, DELETE as deleteRoute } from '../../src/pages/admin/api/audio/[id]/index';
import { PUT as uploadRoute } from '../../src/pages/admin/api/audio/[id]/upload';
import { POST as signRoute } from '../../src/pages/admin/api/audio/[id]/sign';
import { POST as finalizeRoute } from '../../src/pages/admin/api/audio/[id]/finalize';

const configured: AudioEnvironment = { ...env, SUPABASE_URL: 'https://archive-test.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', SUPABASE_AUDIO_BUCKET: 'SeriesBumb' };
const firebaseConfigured: AudioEnvironment = { ...configured, AUDIO_FIREBASE_ENABLED: 'true', FIREBASE_STORAGE_BUCKET: 'archive-test.firebasestorage.app', FIREBASE_SERVICE_ACCOUNT_JSON: '{}' };
let userId: string;
const audio = new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 0, 1, 2]);
const details = (size = audio.length) => ({ title: 'เทปเก่า', provider: 'supabase', filename: 'เพลง.mp3', size, contentType: 'audio/mpeg' });
const inputRequest = (bytes = audio) => new Request('http://localhost:4321/admin/api/audio/upload', { method: 'PUT', body: bytes, headers: { 'Content-Type': 'audio/mpeg' } });
function fakeStore(): AudioStore {
  return { put: vi.fn(async (_key, body) => { await new Response(body).arrayBuffer(); }), get: vi.fn(async () => ({ body: new Response(audio).body!, size: audio.length })), delete: vi.fn(async () => undefined) };
}
function fakeDirectStore(): DirectAudioStore {
  return {
    assertBucketUploadLimit: vi.fn(async () => undefined),
    signUpload: vi.fn(async () => 'https://archive-test.supabase.co/storage/v1/object/upload/sign/SeriesBumb/audio/test.mp3?token=test'),
    head: vi.fn(async () => ({ size: audio.length, contentType: 'audio/mpeg' })),
    prefix: vi.fn(async () => audio),
  };
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

  it('builds every direct-upload provider request with options the Workers runtime accepts', async () => {
    const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      // workerd validates options here; for example it rejects redirect: 'error'.
      const checked = new Request(url, init);
      expect(checked.redirect).toBe('manual');
      if (new URL(checked.url).pathname.endsWith('/bucket/SeriesBumb')) return Response.json({ id: 'SeriesBumb', public: false, file_size_limit: AUDIO_LIMITS.supabase.signedUpload });
      if (checked.method === 'POST') return Response.json({ url: '/object/upload/sign/SeriesBumb/audio/test.mp3?token=signed-test-token' });
      if (checked.method === 'HEAD') return new Response(null, { headers: { 'Content-Length': String(audio.length), 'Content-Type': 'audio/mpeg' } });
      return new Response(audio, { status: 206, headers: { 'Content-Length': '12', 'Content-Range': `bytes 0-11/${audio.length}` } });
    });
    const store = new SupabaseAudioStore(configured.SUPABASE_URL!, configured.SUPABASE_SECRET_KEY!, configured.SUPABASE_AUDIO_BUCKET!, request);
    await store.assertBucketUploadLimit(AUDIO_LIMITS.supabase.signedUpload);
    expect(await store.signUpload('audio/test.mp3')).toContain('/object/upload/sign/SeriesBumb/audio/test.mp3?token=');
    expect(await store.head('audio/test.mp3')).toEqual({ size: audio.length, contentType: 'audio/mpeg' });
    expect(await store.prefix('audio/test.mp3', audio.length)).toEqual(audio);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('treats a provider redirect as a failure instead of following it', async () => {
    const redirect = async () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example/' } });
    const store = new SupabaseAudioStore(configured.SUPABASE_URL!, configured.SUPABASE_SECRET_KEY!, configured.SUPABASE_AUDIO_BUCKET!, redirect);
    await expect(store.assertBucketUploadLimit(AUDIO_LIMITS.supabase.signedUpload)).rejects.toMatchObject({ status: 503 });
    await expect(store.signUpload('audio/test.mp3')).rejects.toMatchObject({ status: 502 });
    await expect(store.head('audio/test.mp3')).rejects.toMatchObject({ status: 502 });
    await expect(store.prefix('audio/test.mp3', audio.length)).rejects.toMatchObject({ status: 502 });
  });

  it('serializes simultaneous reservations at the storage limit including pending uploads', async () => {
    for (let index = 0; index < 16; index++) await reserveAudio(configured, details(), userId);
    const results = await Promise.allSettled([reserveAudio(configured, details(), userId), reserveAudio(configured, details(), userId)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await audioUsage(configured))[0].reservedBytes).toBe(17 * AUDIO_LIMITS.supabase.signedUpload);
  });

  it('rejects oversized files and Firebase while its switch is disabled', async () => {
    await expect(reserveAudio(configured, details(50_000_001), userId)).rejects.toMatchObject({ status: 413 });
    await expect(reserveAudio({ ...configured, FIREBASE_STORAGE_BUCKET: 'test', FIREBASE_SERVICE_ACCOUNT_JSON: '{}' }, { ...details(), provider: 'firebase' }, userId)).rejects.toMatchObject({ status: 503 });
    expect((await listAudio(configured)).files).toHaveLength(0);
  });

  it('streams valid uploads and locks against a second upload or concurrent delete', async () => {
    const { file } = await reserveAudio(firebaseConfigured, { ...details(), provider: 'firebase' }, userId);
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const store = fakeStore();
    store.put = vi.fn(async (_key, body) => { entered(); await waiting; await new Response(body).arrayBuffer(); });
    const upload = uploadAudio(firebaseConfigured, file.id, inputRequest(), () => store);
    await started;
    await expect(uploadAudio(firebaseConfigured, file.id, inputRequest(), () => store)).rejects.toMatchObject({ status: 409 });
    await expect(deleteAudio(firebaseConfigured, file.id, () => store)).rejects.toMatchObject({ status: 409 });
    release();
    expect((await upload).status).toBe('ready');
    const usage = (await audioUsage(firebaseConfigured))[1];
    expect(usage.usedBytes).toBe(audio.length);
    expect(usage.reservedBytes).toBe(0);
  });

  it('rejects mismatched headers, signatures and streamed size; keeps failed reservations', async () => {
    const store = fakeStore();
    const first = (await reserveAudio(firebaseConfigured, { ...details(), provider: 'firebase' }, userId)).file;
    const wrongLength = inputRequest();
    wrongLength.headers.set('Content-Length', '13');
    await expect(uploadAudio(firebaseConfigured, first.id, wrongLength, () => store)).rejects.toMatchObject({ status: 400 });
    const invalidSignature = new Uint8Array(audio.length).fill(60);
    await expect(uploadAudio(firebaseConfigured, first.id, inputRequest(invalidSignature), () => store)).rejects.toMatchObject({ status: 400 });
    expect(store.put).not.toHaveBeenCalled();
    const second = (await reserveAudio(firebaseConfigured, { ...details(audio.length + 1), provider: 'firebase' }, userId)).file;
    await expect(uploadAudio(firebaseConfigured, second.id, inputRequest(), () => store)).rejects.toMatchObject({ status: 400 });
    const third = (await reserveAudio(firebaseConfigured, { ...details(), provider: 'firebase' }, userId)).file;
    await expect(uploadAudio(firebaseConfigured, third.id, inputRequest(new Uint8Array([...audio, 5])), () => store)).rejects.toMatchObject({ status: 413 });
    const files = (await listAudio(configured)).files;
    expect(files.every(file => file.status === 'failed')).toBe(true);
    expect((await audioUsage(firebaseConfigured))[1].reservedBytes).toBe(audio.length * 3 + 1);
  });

  it('signs a reserved Supabase path and finalizes only after remote size, MIME, and signature match', async () => {
    const { file } = await reserveAudio(configured, details(), userId);
    const store = fakeDirectStore();
    const legacyStore = fakeStore();
    expect((await audioUsage(configured))[0].reservedBytes).toBe(AUDIO_LIMITS.supabase.signedUpload);
    await expect(uploadAudio(configured, file.id, inputRequest(), () => legacyStore)).rejects.toMatchObject({ status: 409 });
    expect((await listAudio(configured)).files[0].status).toBe('pending');
    expect(legacyStore.put).not.toHaveBeenCalled();
    const signed = await signAudio(configured, file.id, () => store);
    expect(signed).toMatchObject({ uploadMethod: 'PUT', uploadHeaders: { 'Content-Type': 'audio/mpeg', 'x-upsert': 'false' }, expiresInSeconds: 7200 });
    expect((await listAudio(configured)).files[0].status).toBe('uploading');
    expect((await audioUsage(configured))[0].reservedBytes).toBe(AUDIO_LIMITS.supabase.signedUpload);
    await expect(signAudio(configured, file.id, () => store)).rejects.toMatchObject({ status: 409 });
    expect((await finalizeAudio(configured, file.id, () => store)).status).toBe('ready');
    expect((await finalizeAudio(configured, file.id, () => store)).status).toBe('ready');
    expect(store.head).toHaveBeenCalledTimes(2);
    expect((await audioUsage(configured))[0]).toMatchObject({ usedBytes: audio.length, reservedBytes: 0 });
    await expect(uploadAudio(configured, file.id, inputRequest(), () => legacyStore)).rejects.toMatchObject({ status: 409 });
  });

  it('reissues a signed URL for the same reserved key only while the object is absent', async () => {
    const { file } = await reserveAudio(configured, details(), userId);
    const store = fakeDirectStore();
    await signAudio(configured, file.id, () => store);
    const priorSignedAt = Date.now() - 60_000;
    await env.DB.prepare('UPDATE audio_file SET signedAt = ? WHERE id = ?').bind(priorSignedAt, file.id).run();
    store.head = vi.fn(async () => null);
    await signAudio(configured, file.id, () => store);
    expect((await env.DB.prepare('SELECT signedAt FROM audio_file WHERE id = ?').bind(file.id).first<{ signedAt: number }>())?.signedAt).toBeGreaterThan(priorSignedAt);
    expect(store.signUpload).toHaveBeenCalledTimes(2);
    expect((await audioUsage(configured))[0].reservedBytes).toBe(AUDIO_LIMITS.supabase.signedUpload);
    store.head = vi.fn(async () => ({ size: audio.length, contentType: 'audio/mpeg' }));
    await expect(signAudio(configured, file.id, () => store)).rejects.toMatchObject({ status: 409 });
    expect(store.signUpload).toHaveBeenCalledTimes(2);
  });

  it('keeps the worst-case slot through concurrent signatures and releases it after finalize', async () => {
    const store = fakeDirectStore();
    for (let index = 0; index < 15; index++) {
      const { file } = await reserveAudio(configured, details(), userId);
      await signAudio(configured, file.id, () => store);
    }
    const first = (await reserveAudio(configured, details(), userId)).file;
    const second = (await reserveAudio(configured, details(), userId)).file;
    const signatures = await Promise.allSettled([signAudio(configured, first.id, () => store), signAudio(configured, second.id, () => store)]);
    expect(signatures.filter(result => result.status === 'fulfilled')).toHaveLength(2);
    expect((await audioUsage(configured))[0].reservedBytes).toBe(17 * AUDIO_LIMITS.supabase.signedUpload);
    await expect(reserveAudio(configured, details(), userId)).rejects.toMatchObject({ status: 409 });
    await finalizeAudio(configured, first.id, () => store);
    expect((await audioUsage(configured))[0]).toMatchObject({ usedBytes: audio.length, reservedBytes: 16 * AUDIO_LIMITS.supabase.signedUpload });
    await reserveAudio(configured, details(), userId);
  });

  it('blocks a signature if legacy rows make the worst-case total exceed the cap', async () => {
    const store = fakeDirectStore();
    let pendingId = '';
    for (let index = 0; index < 17; index++) pendingId = (await reserveAudio(configured, details(), userId)).file.id;
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO audio_file (id,title,filename,provider,size,contentType,objectKey,status,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(id, 'legacy', 'legacy.mp3', 'supabase', audio.length, 'audio/mpeg', `audio/${id}/${id}.mp3`, 'pending', Date.now(), Date.now()).run();
    await expect(signAudio(configured, pendingId, () => store)).rejects.toMatchObject({ status: 409 });
    expect(store.signUpload).not.toHaveBeenCalled();
  });

  it('keeps Supabase reservations until a valid remote object is found, and permits later finalize retry', async () => {
    const { file } = await reserveAudio(configured, details(), userId);
    const store = fakeDirectStore();
    await signAudio(configured, file.id, () => store);
    store.head = vi.fn(async () => null);
    await expect(finalizeAudio(configured, file.id, () => store)).rejects.toMatchObject({ status: 409 });
    expect((await listAudio(configured)).files[0].status).toBe('uploading');
    store.head = vi.fn(async () => ({ size: audio.length + 1, contentType: 'audio/mpeg' }));
    await expect(finalizeAudio(configured, file.id, () => store)).rejects.toMatchObject({ status: 400 });
    expect((await listAudio(configured)).files[0].status).toBe('failed');
    store.head = vi.fn(async () => ({ size: audio.length, contentType: 'audio/mpeg' }));
    store.prefix = vi.fn(async () => new Uint8Array(12));
    await expect(finalizeAudio(configured, file.id, () => store)).rejects.toMatchObject({ status: 400 });
    store.prefix = vi.fn(async () => audio);
    expect((await finalizeAudio(configured, file.id, () => store)).status).toBe('ready');
  });

  it('returns a failed Supabase signing reservation to pending without exposing provider tokens', async () => {
    const { file } = await reserveAudio(configured, details(), userId);
    const store = fakeDirectStore();
    store.signUpload = vi.fn(async () => { throw new Error('provider unavailable'); });
    await expect(signAudio(configured, file.id, () => store)).rejects.toThrow('provider unavailable');
    expect((await listAudio(configured)).files[0].status).toBe('pending');
    expect((await env.DB.prepare('SELECT signedAt FROM audio_file WHERE id = ?').bind(file.id).first<{ signedAt: number | null }>())?.signedAt).toBeNull();
    expect((await audioUsage(configured))[0].reservedBytes).toBe(AUDIO_LIMITS.supabase.signedUpload);
    store.signUpload = vi.fn(async () => 'https://archive-test.supabase.co/storage/v1/object/upload/sign/SeriesBumb/audio/test.mp3?token=test');
    await signAudio(configured, file.id, () => store);
    const priorSignedAt = (await env.DB.prepare('SELECT signedAt FROM audio_file WHERE id = ?').bind(file.id).first<{ signedAt: number }>())!.signedAt;
    store.head = vi.fn(async () => null);
    store.signUpload = vi.fn(async () => { throw new Error('provider unavailable'); });
    await expect(signAudio(configured, file.id, () => store)).rejects.toThrow('provider unavailable');
    expect((await env.DB.prepare('SELECT status, signedAt FROM audio_file WHERE id = ?').bind(file.id).first<{ status: string; signedAt: number }>()))
      .toMatchObject({ status: 'uploading', signedAt: priorSignedAt });
  });

  it('blocks deletion of signed Supabase objects until the two-hour token and safety margin expire', async () => {
    const { file } = await reserveAudio(configured, details(), userId);
    const direct = fakeDirectStore();
    const store = fakeStore();
    await signAudio(configured, file.id, () => direct);
    await finalizeAudio(configured, file.id, () => direct);
    await expect(deleteAudio(configured, file.id, () => store)).rejects.toMatchObject({ status: 409 });
    expect(store.delete).not.toHaveBeenCalled();
    const expiredAt = Date.now() - 2 * 60 * 60_000 - 16 * 60_000;
    await env.DB.prepare('UPDATE audio_file SET signedAt = ? WHERE id = ?').bind(expiredAt, file.id).run();
    await deleteAudio(configured, file.id, () => store);
    expect(store.delete).toHaveBeenCalledOnce();
    expect((await audioUsage(configured))[0].usedBytes).toBe(0);
  });

  it('does not delete a signed stale upload after only the legacy fifteen-minute timeout', async () => {
    const { file } = await reserveAudio(configured, details(), userId);
    const direct = fakeDirectStore();
    const store = fakeStore();
    await signAudio(configured, file.id, () => direct);
    await env.DB.prepare('UPDATE audio_file SET updatedAt = ? WHERE id = ?').bind(Date.now() - 16 * 60_000, file.id).run();
    await expect(deleteAudio(configured, file.id, () => store)).rejects.toMatchObject({ status: 409 });
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('does not free bytes when remote deletion is uncertain and permits retry', async () => {
    const { file } = await reserveAudio(configured, details(), userId);
    const store = fakeStore();
    store.delete = vi.fn(async () => { throw new Error('timeout'); });
    await expect(deleteAudio(configured, file.id, () => store)).rejects.toThrow('timeout');
    // Never signed, so no object larger than the reserved size can exist.
    expect((await audioUsage(configured))[0].reservedBytes).toBe(audio.length);
    expect((await listAudio(configured)).files[0].status).toBe('deleting');
    store.delete = vi.fn(async () => undefined);
    await deleteAudio(configured, file.id, () => store);
    expect((await audioUsage(configured))[0].reservedBytes).toBe(0);
  });

  it('charges a verified file only its size while its deletion is retried near the cap', async () => {
    const direct = fakeDirectStore();
    const { file } = await reserveAudio(configured, details(), userId);
    await signAudio(configured, file.id, () => direct);
    await finalizeAudio(configured, file.id, () => direct);
    await env.DB.prepare('UPDATE audio_file SET signedAt = ? WHERE id = ?').bind(Date.now() - 3 * 60 * 60_000, file.id).run();
    const pending: string[] = [];
    for (let index = 0; index < 17; index++) pending.push((await reserveAudio(configured, details(), userId)).file.id);
    const store = fakeStore();
    store.delete = vi.fn(async () => { throw new Error('timeout'); });
    await expect(deleteAudio(configured, file.id, () => store)).rejects.toThrow('timeout');
    expect((await audioUsage(configured))[0]).toMatchObject({ usedBytes: 0, reservedBytes: 17 * AUDIO_LIMITS.supabase.signedUpload + audio.length });
    await signAudio(configured, pending[0], () => direct);
    // A signed row that never verified keeps its worst-case slot while deleting.
    const failed = (await listAudio(configured)).files.find(row => row.id === pending[0])!;
    await env.DB.prepare("UPDATE audio_file SET status = 'failed', signedAt = ? WHERE id = ?").bind(Date.now() - 3 * 60 * 60_000, failed.id).run();
    await expect(deleteAudio(configured, failed.id, () => store)).rejects.toThrow('timeout');
    expect((await audioUsage(configured))[0].reservedBytes).toBe(17 * AUDIO_LIMITS.supabase.signedUpload + audio.length);
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
    const direct = fakeDirectStore();
    await signAudio(configured, file.id, () => direct);
    await finalizeAudio(configured, file.id, () => direct);
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
    const direct = fakeDirectStore();
    await signAudio(configured, file.id, () => direct);
    await finalizeAudio(configured, file.id, () => direct);
    const response = await downloadAudio(configured, file.id, () => store);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Content-Disposition')).toContain('attachment;');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(audio);
    expect((await listAudio(configured)).files[0]).not.toHaveProperty('objectKey');
  });
});

describe('direct audio REST authorization', () => {
  const routes = [listRoute, reserveRoute, downloadRoute, deleteRoute, uploadRoute, signRoute, finalizeRoute];
  function context(role: 'admin' | 'member' | null, withSession: boolean, origin = 'http://localhost:4321'): APIContext {
    return {
      locals: { user: role ? { id: userId, role, name: 'User', email: 'user@example.test', image: null, commentBanned: false } : null, session: withSession ? { id: 'test-session', expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(Date.now() - 60_000) } : null },
      request: new Request('http://localhost:4321/admin/api/audio', { headers: { Origin: origin } }), params: {},
    } as APIContext;
  }
  it('requires a fresh sign-in before deleting an audio file', async () => {
    const stale = {
      locals: { user: { id: userId, role: 'admin', name: 'Admin', email: 'admin@example.test', image: null, commentBanned: false }, session: { id: 'stale', expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(Date.now() - 20 * 60_000) } },
      request: new Request('http://localhost:4321/admin/api/audio/x', { method: 'DELETE', headers: { Origin: 'http://localhost:4321' } }),
      params: { id: '00000000-0000-4000-8000-000000000000' },
    } as unknown as APIContext;
    const response = await deleteRoute(stale);
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: string }).error).toContain('เข้าสู่ระบบใหม่');
  });

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
    for (const route of [reserveRoute, deleteRoute, uploadRoute, signRoute, finalizeRoute]) {
      const ctx = context('admin', true);
      ctx.request.headers.delete('Origin');
      expect((await route(ctx)).status).toBe(403);
    }
  });
});
