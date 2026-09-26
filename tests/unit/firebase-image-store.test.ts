import { describe, expect, it, vi } from 'vitest';
import { FirebaseImageStore } from '../../src/lib/services/firebase-image-store';

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/gu, '+').replace(/_/gu, '/');
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), char => char.charCodeAt(0));
}

describe('FirebaseImageStore', () => {
  it('signs one service-account token and uses it for upload, metadata, download, and deletion', async () => {
    const signingKey = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', signingKey.privateKey));
    const privateKey = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----\n`;
    const bucket = 'seriesbumb-test.firebasestorage.app';
    const key = 'tapes/abc/ชื่อ เทป-full.webp';
    const objectUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(key)}`;
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        const body = new URLSearchParams(init?.body as string);
        expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
        const [header, claims, signature] = body.get('assertion')!.split('.');
        expect(JSON.parse(new TextDecoder().decode(fromBase64Url(header)))).toMatchObject({ alg: 'RS256' });
        const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(claims)));
        expect(payload).toMatchObject({ iss: 'images@seriesbumb-test.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/devstorage.read_write', aud: url });
        expect(payload.exp - payload.iat).toBe(3600);
        expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', signingKey.publicKey, new Uint8Array(fromBase64Url(signature)).buffer, new TextEncoder().encode(`${header}.${claims}`))).toBe(true);
        return Response.json({ access_token: 'test-access-token' });
      }
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-access-token');
      if (url.startsWith('https://storage.googleapis.com/upload/')) {
        const uploadUrl = new URL(url);
        expect(init?.method).toBe('POST');
        expect(uploadUrl.searchParams.get('uploadType')).toBe('media');
        expect(uploadUrl.searchParams.get('name')).toBe(key);
        expect(new Headers(init?.headers).get('Content-Type')).toBe('image/webp');
        expect(new Uint8Array(init?.body as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
        return Response.json({ name: key });
      }
      expect(url.startsWith(objectUrl)).toBe(true);
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      if (url.endsWith('?fields=size')) return Response.json({ size: '3' });
      if (url.endsWith('?alt=media')) return new Response(new Uint8Array([1, 2, 3]).buffer, { headers: { 'Content-Type': 'image/webp' } });
      throw new Error(`Unexpected request ${url}`);
    });
    const store = new FirebaseImageStore(bucket, JSON.stringify({ client_email: 'images@seriesbumb-test.iam.gserviceaccount.com', private_key: privateKey }), request);
    await store.put(key, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'image/webp' } });
    expect(await store.head(key)).toEqual({ size: 3 });
    const downloaded = await store.get(key);
    expect(downloaded?.httpMetadata?.contentType).toBe('image/webp');
    expect(new Uint8Array(await new Response(downloaded!.body).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    await store.delete(key);
    expect(request.mock.calls.filter(([input]) => String(input) === 'https://oauth2.googleapis.com/token')).toHaveLength(1);
  });

  it('rejects malformed credentials and bucket names before a network request', async () => {
    const bucket = 'seriesbumb-test.firebasestorage.app';
    const request = vi.fn(async () => new Response(null, { status: 404 }));
    const store = new FirebaseImageStore(bucket, '{}', request);
    await expect(store.head('missing')).rejects.toThrow('missing credentials');
    expect(request).not.toHaveBeenCalled();
    expect(() => new FirebaseImageStore('https://evil.example', '{}', request)).toThrow('bucket is not configured');
  });
});
