import { FirebaseImageStore } from './firebase-image-store';
import { AudioArchiveError } from './audio-types';

export interface AudioEnvironment {
  DB: D1Database;
  SITE_URL: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_AUDIO_BUCKET?: string;
  AUDIO_FIREBASE_ENABLED?: string;
  FIREBASE_STORAGE_BUCKET?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
}

export interface AudioStore {
  put(key: string, body: ReadableStream<Uint8Array>, size: number, contentType: string, signal?: AbortSignal): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream; size?: number } | null>;
  delete(key: string): Promise<void>;
}

export class SupabaseAudioStore implements AudioStore {
  private readonly base: string;
  constructor(url: string, private readonly key: string, private readonly bucket: string, private readonly request: typeof fetch = (input, init) => fetch(input, init)) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/u.test(parsed.hostname) || parsed.port || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new AudioArchiveError(503, 'ตั้งค่า Supabase URL ไม่ถูกต้อง');
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/u.test(bucket)) throw new AudioArchiveError(503, 'ตั้งค่าถังเก็บเพลงไม่ถูกต้อง');
    this.base = `${parsed.origin}/storage/v1`;
  }

  private headers(extra?: HeadersInit): Headers {
    const headers = new Headers(extra);
    headers.set('apikey', this.key);
    // New secret keys resolve through the gateway; legacy service-role JWTs also need Bearer.
    if (!this.key.startsWith('sb_secret_')) headers.set('Authorization', `Bearer ${this.key}`);
    return headers;
  }

  private path(key: string): string {
    return `${encodeURIComponent(this.bucket)}/${key.split('/').map(part => encodeURIComponent(part)).join('/')}`;
  }

  async put(key: string, body: ReadableStream<Uint8Array>, _size: number, contentType: string, signal = AbortSignal.timeout(120_000)): Promise<void> {
    const response = await this.request(`${this.base}/object/${this.path(key)}`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': contentType, 'Cache-Control': 'private, no-store', 'x-upsert': 'false' }),
      body,
      signal,
    });
    await response.body?.cancel();
    if (!response.ok) throw new AudioArchiveError(502, 'อัปโหลดไป Supabase ไม่สำเร็จ กรุณาลบรายการที่ค้างก่อนลองใหม่');
  }

  async get(key: string): Promise<{ body: ReadableStream; size?: number } | null> {
    const response = await this.request(`${this.base}/object/authenticated/${this.path(key)}`, { headers: this.headers(), signal: AbortSignal.timeout(120_000) });
    if (response.status === 404) { await response.body?.cancel(); return null; }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new AudioArchiveError(502, 'อ่านไฟล์จาก Supabase ไม่สำเร็จ');
    }
    const length = response.headers.get('Content-Length');
    return { body: response.body, size: length && /^\d+$/u.test(length) ? Number(length) : undefined };
  }

  async delete(key: string): Promise<void> {
    // A successful DELETE can return an empty list when the object never completed upload.
    const response = await this.request(`${this.base}/object/${encodeURIComponent(this.bucket)}`, {
      method: 'DELETE', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: [key] }), signal: AbortSignal.timeout(30_000),
    });
    await response.body?.cancel();
    if (!response.ok && response.status !== 404) throw new AudioArchiveError(502, 'ลบไฟล์จาก Supabase ไม่สำเร็จ จึงยังไม่คืนพื้นที่');
  }
}

export function audioStore(env: AudioEnvironment, provider: 'supabase' | 'firebase', cleanupOnly = false): AudioStore {
  if (provider === 'supabase') {
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.SUPABASE_AUDIO_BUCKET) throw new AudioArchiveError(503, 'ยังไม่ได้เชื่อมต่อ Supabase Storage');
    return new SupabaseAudioStore(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, env.SUPABASE_AUDIO_BUCKET);
  }
  if ((!cleanupOnly && env.AUDIO_FIREBASE_ENABLED !== 'true') || !env.FIREBASE_STORAGE_BUCKET || !env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new AudioArchiveError(503, 'ปิดคลังเพลง Firebase เพื่อป้องกันค่าใช้จ่าย Blaze');
  }
  const store = new FirebaseImageStore(env.FIREBASE_STORAGE_BUCKET, env.FIREBASE_SERVICE_ACCOUNT_JSON);
  return { put: (key, body, size, type, signal) => store.putStream(key, body, size, type, signal), get: key => store.get(key), delete: key => store.delete(key) };
}
