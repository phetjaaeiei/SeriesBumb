import type { ImageStore } from './image-store';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const STORAGE_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write';

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function parseServiceAccount(json: string): ServiceAccountKey {
  let parsed: unknown;
  try { parsed = JSON.parse(json); }
  catch { throw new Error('Firebase service account secret is invalid JSON'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('Firebase service account secret is invalid');
  const key = parsed as Partial<ServiceAccountKey>;
  if (typeof key.client_email !== 'string' || !key.client_email.endsWith('.iam.gserviceaccount.com')
    || typeof key.private_key !== 'string' || !key.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('Firebase service account secret is missing credentials');
  }
  return { client_email: key.client_email, private_key: key.private_key };
}

async function signedAssertion(account: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64Url(encoder.encode(JSON.stringify({
    iss: account.client_email,
    scope: STORAGE_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  })));
  const signingInput = `${header}.${claims}`;
  const pem = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/gu, '');
  const keyBytes = Uint8Array.from(atob(pem), char => char.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey('pkcs8', keyBytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, encoder.encode(signingInput));
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

export class FirebaseImageStore implements ImageStore {
  private tokenPromise?: Promise<string>;
  private tokenExpiresAt = 0;

  constructor(private readonly bucket: string, private readonly serviceAccountJson: string, private readonly request: typeof fetch = fetch) {
    if (!/^[a-z0-9][a-z0-9._-]*$/u.test(bucket)) throw new Error('Firebase Storage bucket is not configured');
  }

  private async token(): Promise<string> {
    if (!this.tokenPromise || (this.tokenExpiresAt > 0 && Date.now() >= this.tokenExpiresAt)) {
      this.tokenPromise = (async () => {
        const assertion = await signedAssertion(parseServiceAccount(this.serviceAccountJson));
        const response = await this.request(TOKEN_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
        });
        if (!response.ok) throw new Error(`Firebase service account authorization failed (${response.status})`);
        const data: unknown = await response.json();
        if (!data || typeof data !== 'object' || !('access_token' in data) || typeof data.access_token !== 'string') {
          throw new Error('Firebase service account authorization returned no token');
        }
        const expiresIn = 'expires_in' in data && typeof data.expires_in === 'number' ? data.expires_in : 3600;
        this.tokenExpiresAt = Date.now() + Math.max(0, expiresIn - 60) * 1000;
        return data.access_token;
      })();
    }
    try { return await this.tokenPromise; }
    catch (error) {
      this.tokenPromise = undefined;
      this.tokenExpiresAt = 0;
      throw error;
    }
  }

  private objectUrl(key: string): string {
    return `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(key)}`;
  }

  private async authorized(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${await this.token()}`);
    let response = await this.request(url, { ...init, headers });
    if (response.status === 401) {
      await response.body?.cancel();
      this.tokenPromise = undefined;
      this.tokenExpiresAt = 0;
      headers.set('Authorization', `Bearer ${await this.token()}`);
      response = await this.request(url, { ...init, headers });
    }
    return response;
  }

  async head(key: string): Promise<{ size: number } | null> {
    const response = await this.authorized(`${this.objectUrl(key)}?fields=size`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Firebase Storage metadata request failed (${response.status})`);
    const data: unknown = await response.json();
    const size = data && typeof data === 'object' && 'size' in data ? Number(data.size) : NaN;
    if (!Number.isFinite(size) || size < 0) throw new Error('Firebase Storage returned invalid object size');
    return { size };
  }

  async get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null> {
    const response = await this.authorized(`${this.objectUrl(key)}?alt=media`);
    if (response.status === 404) return null;
    if (!response.ok || !response.body) throw new Error(`Firebase Storage download failed (${response.status})`);
    return { body: response.body, httpMetadata: { contentType: response.headers.get('Content-Type') || undefined } };
  }

  async put(key: string, bytes: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<void> {
    const url = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o`);
    url.searchParams.set('uploadType', 'media');
    url.searchParams.set('name', key);
    const response = await this.authorized(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': options?.httpMetadata?.contentType || 'application/octet-stream' },
      body: new Uint8Array(bytes).buffer,
    });
    if (!response.ok) throw new Error(`Firebase Storage upload failed (${response.status})`);
    await response.body?.cancel();
  }

  async delete(keys: string | string[]): Promise<void> {
    const uniqueKeys = [...new Set(Array.isArray(keys) ? keys : [keys])];
    for (let index = 0; index < uniqueKeys.length; index += 4) {
      await Promise.all(uniqueKeys.slice(index, index + 4).map(async key => {
        const response = await this.authorized(this.objectUrl(key), { method: 'DELETE' });
        if (!response.ok && response.status !== 404) throw new Error(`Firebase Storage delete failed (${response.status})`);
        await response.body?.cancel();
      }));
    }
  }
}

export function firebaseImageStore(env: Pick<Env, 'FIREBASE_STORAGE_BUCKET' | 'FIREBASE_SERVICE_ACCOUNT_JSON'>): FirebaseImageStore {
  return new FirebaseImageStore(env.FIREBASE_STORAGE_BUCKET, env.FIREBASE_SERVICE_ACCOUNT_JSON);
}
