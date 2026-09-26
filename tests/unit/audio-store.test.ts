import { describe, expect, it, vi } from 'vitest';
import { SupabaseAudioStore } from '../../src/lib/services/audio-store';
import { firebaseImageStore, FirebaseImageStore } from '../../src/lib/services/firebase-image-store';
import { audioFormat, canonicalDriveUrl, validatedAudioStream } from '../../src/lib/services/audio-validation';

const mp3 = new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 0, 1, 2]);

describe('audio storage transport', () => {
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

  it('maps browser MIME aliases and strictly canonicalizes Drive links', () => {
    expect(audioFormat('SONG.WAV', 'audio/x-wav').contentType).toBe('audio/wav');
    expect(audioFormat('song.flac', '').contentType).toBe('audio/flac');
    expect(() => audioFormat('song.mp3', 'text/html')).toThrow();
    expect(canonicalDriveUrl('https://drive.google.com/open?id=abcdefghijklmnop&usp=sharing')).toBe('https://drive.google.com/file/d/abcdefghijklmnop/view');
  });
});
