import { describe, expect, it, vi } from 'vitest';
import { SupabaseAudioStore } from '../../src/storage/audio-store';
import { firebaseImageStore, FirebaseImageStore } from '../../src/storage/firebase-image-store';
import { audioFormat, canonicalDriveUrl, validAudioSignature, validatedAudioStream } from '../../src/services/audio-validation';

const mp3 = new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 0, 1, 2]);

describe('audio storage transport', () => {
  it('issues a private upload token and verifies object metadata plus only twelve signature bytes', async () => {
    const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const target = String(url);
      const headers = new Headers(init?.headers);
      expect(headers.get('apikey')).toBe('sb_secret_test-only');
      expect(init?.redirect).toBe('manual');
      if (target.endsWith('/bucket/SeriesBumb')) return Response.json({ id: 'SeriesBumb', public: false, file_size_limit: 52_428_800 });
      if (init?.method === 'POST') {
        expect(target).toBe('https://test-project.supabase.co/storage/v1/object/upload/sign/SeriesBumb/audio/file.mp3');
        expect(headers.get('x-upsert')).toBe('false');
        return Response.json({ url: '/object/upload/sign/SeriesBumb/audio/file.mp3?token=signed-test-token' });
      }
      expect(target).toBe('https://test-project.supabase.co/storage/v1/object/authenticated/SeriesBumb/audio/file.mp3');
      if (init?.method === 'HEAD') return new Response(null, { headers: { 'Content-Length': String(mp3.length), 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes' } });
      expect(headers.get('Range')).toBe('bytes=0-11');
      return new Response(mp3, { status: 206, headers: { 'Content-Length': '12', 'Content-Range': `bytes 0-11/${mp3.length}` } });
    });
    const store = new SupabaseAudioStore('https://test-project.supabase.co', 'sb_secret_test-only', 'SeriesBumb', request);
    await store.assertBucketUploadLimit(52_428_800);
    expect(await store.signUpload('audio/file.mp3')).toBe('https://test-project.supabase.co/storage/v1/object/upload/sign/SeriesBumb/audio/file.mp3?token=signed-test-token');
    expect(await store.head('audio/file.mp3')).toEqual({ size: mp3.length, contentType: 'audio/mpeg' });
    expect(await store.prefix('audio/file.mp3', mp3.length)).toEqual(mp3);
    expect(request).toHaveBeenCalledTimes(4);
  });

  it('fails closed when the bucket is public or permits larger files than accounted for', async () => {
    for (const bucket of [
      { id: 'SeriesBumb', public: true, file_size_limit: 52_428_800 },
      { id: 'SeriesBumb', public: false, file_size_limit: 52_428_801 },
      { id: 'SeriesBumb', public: false, file_size_limit: null },
    ]) {
      const store = new SupabaseAudioStore('https://test-project.supabase.co', 'sb_secret_test-only', 'SeriesBumb', async () => Response.json(bucket));
      await expect(store.assertBucketUploadLimit(52_428_800)).rejects.toMatchObject({ status: 503 });
    }
  });

  it('rejects a signed upload URL pointing outside its reserved object key', async () => {
    const store = new SupabaseAudioStore('https://test-project.supabase.co', 'sb_secret_test-only', 'SeriesBumb', async () => Response.json({ url: '/object/upload/sign/SeriesBumb/audio/other.mp3?token=signed-test-token' }));
    await expect(store.signUpload('audio/file.mp3')).rejects.toMatchObject({ status: 502 });
  });

  it('refuses a full-object fallback when a ranged signature fetch is unavailable', async () => {
    const store = new SupabaseAudioStore('https://test-project.supabase.co', 'sb_secret_test-only', 'SeriesBumb', async () => new Response(mp3, { status: 200 }));
    await expect(store.prefix('audio/file.mp3', mp3.length)).rejects.toMatchObject({ status: 502 });
  });

  it('treats Supabase missing-object HEAD 400 as no completed upload', async () => {
    const store = new SupabaseAudioStore('https://test-project.supabase.co', 'sb_secret_test-only', 'SeriesBumb', async () => new Response(null, { status: 400 }));
    await expect(store.head('audio/file.mp3')).resolves.toBeNull();
  });

  it('treats only a NoSuchKey GET 400 as a missing object', async () => {
    const missing = new SupabaseAudioStore('https://test-project.supabase.co', 'sb_secret_test-only', 'SeriesBumb', async () => Response.json({ statusCode: '404', error: 'not_found', message: 'Object not found', code: 'NoSuchKey' }, { status: 400 }));
    await expect(missing.get('audio/file.mp3')).resolves.toBeNull();
    const invalid = new SupabaseAudioStore('https://test-project.supabase.co', 'sb_secret_test-only', 'SeriesBumb', async () => Response.json({ statusCode: '400', error: 'InvalidRequest', message: 'bad' }, { status: 400 }));
    await expect(invalid.get('audio/file.mp3')).rejects.toMatchObject({ status: 502 });
  });

  it('streams through an authenticated server request without public tokens or upserts', async () => {
    const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toMatch(/^https:\/\/test-project\.supabase\.co\/storage\/v1\/object\//u);
      expect(new Headers(init?.headers).get('apikey')).toBe('sb_secret_test-only');
      expect(new Headers(init?.headers).get('Authorization')).toBeNull();
      if (init?.method === 'POST') {
        expect(String(url)).toBe('https://test-project.supabase.co/storage/v1/object/SeriesBumb/audio/file.mp3');
        expect(init.body).toBeInstanceOf(ReadableStream);
        expect(new Headers(init.headers).get('x-upsert')).toBe('false');
        expect(new Uint8Array(await new Response(init.body).arrayBuffer())).toEqual(mp3);
        return Response.json({ Key: 'SeriesBumb/audio/file.mp3' });
      }
      if (init?.method === 'DELETE') {
        expect(JSON.parse(String(init.body))).toEqual({ prefixes: ['audio/file.mp3'] });
        return Response.json([]);
      }
      expect(String(url)).toContain('/object/authenticated/SeriesBumb/audio/file.mp3');
      return new Response(mp3, { headers: { 'Content-Length': String(mp3.length) } });
    });
    const store = new SupabaseAudioStore('https://test-project.supabase.co', 'sb_secret_test-only', 'SeriesBumb', request);
    await store.put('audio/file.mp3', new Response(mp3).body!, mp3.length, 'audio/mpeg');
    const object = await store.get('audio/file.mp3');
    expect(object?.size).toBe(mp3.length);
    await object?.body.cancel();
    await store.delete('audio/file.mp3');
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('refuses a credential destination outside the configured Supabase host shape', () => {
    for (const url of ['https://supabase.co.evil.test', 'https://user:pw@test.supabase.co', 'http://test.supabase.co', 'https://test.supabase.co/arbitrary']) {
      expect(() => new SupabaseAudioStore(url, 'secret', 'audio')).toThrow('Supabase URL');
    }
  });

  it('disables Firebase image uploads via the factory before authorization or network work', async () => {
    const store = firebaseImageStore({ FIREBASE_STORAGE_BUCKET: 'test.firebasestorage.app', FIREBASE_SERVICE_ACCOUNT_JSON: '{}' });
    await expect(store.put('images/test', new Uint8Array([1]))).rejects.toThrow('พักการอัปโหลดรูป Firebase');
    const request = vi.fn();
    const direct = new FirebaseImageStore('test.firebasestorage.app', '{}', request, false);
    await expect(direct.put('images/test', new Uint8Array([1]))).rejects.toThrow('พักการอัปโหลดรูป Firebase');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('stream validation', () => {
  it('rejects the stream when the shared deadline expires before a signature arrives', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const validation = validatedAudioStream(stream, 12, 'song.mp3', controller.signal);
    controller.abort();
    await expect(validation).rejects.toMatchObject({ status: 400 });
    expect(cancelled).toBe(true);
  });

  it('supports signatures split across small chunks and rejects trailing bytes', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of mp3) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
    const validation = await validatedAudioStream(stream, mp3.length, 'song.mp3');
    expect(new Uint8Array(await new Response(validation.stream).arrayBuffer())).toEqual(mp3);
    expect(validation.isComplete()).toBe(true);
    const oversized = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(mp3); controller.enqueue(new Uint8Array([42])); controller.close(); } });
    const wrong = await validatedAudioStream(oversized, mp3.length, 'song.mp3');
    await expect(new Response(wrong.stream).arrayBuffer()).rejects.toMatchObject({ status: 413 });
    expect(wrong.isComplete()).toBe(false);
  });

  it('accepts an MP4 clip only with an ISO media ftyp box', () => {
    const ftyp = new Uint8Array([0, 0, 0, 32, 102, 116, 121, 112, 105, 115, 111, 109]);
    expect(validAudioSignature(ftyp, 'clip.mp4')).toBe(true);
    expect(validAudioSignature(mp3, 'clip.mp4')).toBe(false);
  });

  it('maps browser MIME aliases and strictly canonicalizes Drive links', () => {
    expect(audioFormat('SONG.WAV', 'audio/x-wav').contentType).toBe('audio/wav');
    expect(audioFormat('song.flac', '').contentType).toBe('audio/flac');
    expect(() => audioFormat('song.mp3', 'text/html')).toThrow();
    expect(audioFormat('clip.MP4', 'video/mp4').contentType).toBe('video/mp4');
    expect(() => audioFormat('clip.mp4', 'audio/mpeg')).toThrow();
    expect(canonicalDriveUrl('https://drive.google.com/open?id=abcdefghijklmnop&usp=sharing')).toBe('https://drive.google.com/file/d/abcdefghijklmnop/view');
  });
});
