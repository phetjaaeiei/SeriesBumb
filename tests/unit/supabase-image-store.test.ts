import { describe, expect, it, vi } from 'vitest';
import { SupabaseImageStore } from '../../src/storage/supabase-image-store';

describe('SupabaseImageStore', () => {
  it('checks a public image-only bucket before uploading and supports object operations', async () => {
    const calls: string[] = [];
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      calls.push(`${init?.method || 'GET'} ${url}`);
      expect(new Headers(init?.headers).get('apikey')).toBe('sb_secret_test');
      if (url.endsWith('/bucket/SeriesBumbImages')) return Response.json({ id: 'SeriesBumbImages', public: true, file_size_limit: 3_000_000, allowed_mime_types: ['image/jpeg', 'image/webp'] });
      if (init?.method === 'POST') return Response.json({ Key: 'tapes/id/photo-full.webp' });
      if (init?.method === 'HEAD') return new Response(null, { headers: { 'Content-Length': '3' } });
      if (init?.method === 'DELETE') return Response.json({ message: 'Successfully deleted' });
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/webp' } });
    });
    const store = new SupabaseImageStore('https://example.supabase.co', 'sb_secret_test', 'SeriesBumbImages', request);
    await store.assertSafeBucket();
    await store.put('tapes/id/photo-full.webp', new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'image/webp' } });
    expect(await store.head('tapes/id/photo-full.webp')).toEqual({ size: 3 });
    expect((await store.get('tapes/id/photo-full.webp'))?.httpMetadata?.contentType).toBe('image/webp');
    await store.delete('tapes/id/photo-full.webp');
    expect(calls.some(call => call.includes('/object/public/SeriesBumbImages/'))).toBe(true);
  });

  it('refuses a private or unbounded bucket', async () => {
    const request = vi.fn(async () => Response.json({ id: 'SeriesBumbImages', public: false, file_size_limit: null }));
    const store = new SupabaseImageStore('https://example.supabase.co', 'sb_secret_test', 'SeriesBumbImages', request);
    await expect(store.assertSafeBucket()).rejects.toThrow('public');
  });
});
