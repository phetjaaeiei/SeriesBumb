import { FirebaseImageStore } from './firebase-image-store';
import { AudioArchiveError } from '../services/audio-types';

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

function missingObject(body: string): boolean {
  try {
    const error: unknown = JSON.parse(body);
    return typeof error === 'object' && error !== null
      && (('code' in error && error.code === 'NoSuchKey') || ('error' in error && error.error === 'not_found'));
  } catch { return false; }
}

export interface DirectAudioStore {
  assertBucketUploadLimit(maxBytes: number): Promise<void>;
  signUpload(key: string): Promise<string>;
  head(key: string): Promise<{ size: number; contentType: string } | null>;
  prefix(key: string, totalSize: number): Promise<Uint8Array>;
}

export class SupabaseAudioStore implements AudioStore, DirectAudioStore {
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

  async assertBucketUploadLimit(maxBytes: number): Promise<void> {
    const response = await this.request(`${this.base}/bucket/${encodeURIComponent(this.bucket)}`, {
      headers: this.headers(), signal: AbortSignal.timeout(30_000), redirect: 'manual',
    });
    if (!response.ok) { await response.body?.cancel(); throw new AudioArchiveError(503, 'ตรวจสอบขนาดสูงสุดของถัง Supabase ไม่สำเร็จ'); }
    let bucket: unknown;
    try { bucket = await response.json(); }
    catch { throw new AudioArchiveError(503, 'ข้อมูลถัง Supabase ไม่ถูกต้อง'); }
    if (!bucket || typeof bucket !== 'object' || !('id' in bucket) || bucket.id !== this.bucket || !('public' in bucket) || bucket.public !== false
      || !('file_size_limit' in bucket) || typeof bucket.file_size_limit !== 'number' || !Number.isSafeInteger(bucket.file_size_limit)
      || bucket.file_size_limit < 12 || bucket.file_size_limit > maxBytes) {
      throw new AudioArchiveError(503, 'ถัง Supabase ต้องเป็นส่วนตัวและจำกัดขนาดไฟล์ไม่เกิน 50 MiB');
    }
  }

  async signUpload(key: string): Promise<string> {
    const path = this.path(key);
    const response = await this.request(`${this.base}/object/upload/sign/${path}`, {
      method: 'POST', headers: this.headers({ 'Content-Type': 'application/json', 'x-upsert': 'false' }),
      body: '{}', signal: AbortSignal.timeout(30_000), redirect: 'manual',
    });
    if (!response.ok) { await response.body?.cancel(); throw new AudioArchiveError(502, 'ออกลิงก์อัปโหลด Supabase ไม่สำเร็จ'); }
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new AudioArchiveError(502, 'Supabase ส่งลิงก์อัปโหลดไม่ถูกต้อง'); }
    const relative = typeof data === 'object' && data !== null && 'url' in data ? data.url : null;
    if (typeof relative !== 'string' || !relative.startsWith('/object/upload/sign/')) throw new AudioArchiveError(502, 'Supabase ส่งลิงก์อัปโหลดไม่ถูกต้อง');
    const url = new URL(`${this.base}${relative}`);
    if (url.origin !== new URL(this.base).origin || url.pathname !== `${new URL(this.base).pathname}/object/upload/sign/${path}` || !url.searchParams.get('token') || url.username || url.password || url.hash) {
      throw new AudioArchiveError(502, 'Supabase ส่งลิงก์อัปโหลดไม่ถูกต้อง');
    }
    return url.toString();
  }

  async head(key: string): Promise<{ size: number; contentType: string } | null> {
    const response = await this.request(`${this.base}/object/authenticated/${this.path(key)}`, {
      method: 'HEAD', headers: this.headers(), signal: AbortSignal.timeout(30_000), redirect: 'manual',
    });
    await response.body?.cancel();
    // Supabase Storage answers HEAD of a missing private object with 400 and no body.
    // The key is generated by this application.
    if (response.status === 400 || response.status === 404) return null;
    if (!response.ok) throw new AudioArchiveError(502, 'ตรวจสอบไฟล์ใน Supabase ไม่สำเร็จ');
    const length = response.headers.get('Content-Length');
    const contentType = response.headers.get('Content-Type');
    if (!length || !/^\d+$/u.test(length) || !Number.isSafeInteger(Number(length)) || !contentType) throw new AudioArchiveError(502, 'Supabase ส่งข้อมูลขนาดหรือชนิดไฟล์ไม่ครบ');
    return { size: Number(length), contentType: contentType.split(';')[0].trim().toLowerCase() };
  }

  async prefix(key: string, totalSize: number): Promise<Uint8Array> {
    const response = await this.request(`${this.base}/object/authenticated/${this.path(key)}`, {
      headers: this.headers({ Range: 'bytes=0-11' }), signal: AbortSignal.timeout(30_000), redirect: 'manual',
    });
    if (response.status !== 206 || response.headers.get('Content-Range') !== `bytes 0-11/${totalSize}` || response.headers.get('Content-Length') !== '12' || !response.body) {
      await response.body?.cancel();
      throw new AudioArchiveError(502, 'Supabase ไม่รองรับการตรวจเฉพาะต้นไฟล์');
    }
    const reader = response.body.getReader();
    const bytes = new Uint8Array(12);
    let offset = 0;
    try {
      while (offset < bytes.length) {
        const next = await reader.read();
        if (next.done || offset + next.value.byteLength > bytes.length) throw new AudioArchiveError(502, 'Supabase ส่งข้อมูลต้นไฟล์ไม่ครบหรือเกิน');
        bytes.set(next.value, offset);
        offset += next.value.byteLength;
      }
      return bytes;
    } finally { await reader.cancel().catch(() => undefined); }
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
    if (response.status === 400 || response.status === 404) {
      // A missing private object answers GET with 400 and a NoSuchKey body.
      const body = await response.text().catch(() => '');
      if (response.status === 404 || missingObject(body)) return null;
      throw new AudioArchiveError(502, 'อ่านไฟล์จาก Supabase ไม่สำเร็จ');
    }
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

export function supabaseAudioStore(env: AudioEnvironment): SupabaseAudioStore {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY || !env.SUPABASE_AUDIO_BUCKET) throw new AudioArchiveError(503, 'ยังไม่ได้เชื่อมต่อ Supabase Storage');
  return new SupabaseAudioStore(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, env.SUPABASE_AUDIO_BUCKET);
}

export function audioStore(env: AudioEnvironment, provider: 'supabase' | 'firebase', cleanupOnly = false): AudioStore {
  if (provider === 'supabase') {
    return supabaseAudioStore(env);
  }
  if ((!cleanupOnly && env.AUDIO_FIREBASE_ENABLED !== 'true') || !env.FIREBASE_STORAGE_BUCKET || !env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new AudioArchiveError(503, 'ปิดคลังเพลง Firebase เพื่อป้องกันค่าใช้จ่าย Blaze');
  }
  const store = new FirebaseImageStore(env.FIREBASE_STORAGE_BUCKET, env.FIREBASE_SERVICE_ACCOUNT_JSON);
  return { put: (key, body, size, type, signal) => store.putStream(key, body, size, type, signal), get: key => store.get(key), delete: key => store.delete(key) };
}
