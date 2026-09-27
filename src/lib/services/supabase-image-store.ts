import type { ImageStore } from './image-store';

export const IMAGE_STORAGE_LIMIT = 50_000_000;

export class SupabaseImageStore implements ImageStore {
  private readonly base: string;

  constructor(url: string, private readonly key: string, private readonly bucket: string, private readonly request: typeof fetch = (input, init) => fetch(input, init)) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/u.test(parsed.hostname) || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('ตั้งค่า Supabase URL สำหรับรูปไม่ถูกต้อง');
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/u.test(bucket) || !key) throw new Error('ยังไม่ได้เชื่อมต่อถังรูป Supabase');
    this.base = `${parsed.origin}/storage/v1`;
  }

  private headers(extra?: HeadersInit): Headers {
    const headers = new Headers(extra);
    headers.set('apikey', this.key);
    if (!this.key.startsWith('sb_secret_')) headers.set('Authorization', `Bearer ${this.key}`);
    return headers;
  }

  private objectPath(key: string): string {
    const parts = key.split('/');
    if (!parts.length || parts.some(part => !part || part === '.' || part === '..' || /[\\?#]/u.test(part))) throw new Error('ชื่อไฟล์รูปไม่ถูกต้อง');
    return `${encodeURIComponent(this.bucket)}/${parts.map(encodeURIComponent).join('/')}`;
  }

  async assertSafeBucket(): Promise<void> {
    const response = await this.request(`${this.base}/bucket/${encodeURIComponent(this.bucket)}`, {
      headers: this.headers(), signal: AbortSignal.timeout(30_000), redirect: 'manual',
    });
    if (!response.ok) throw new Error('ตรวจสอบถังรูป Supabase ไม่สำเร็จ');
    const bucket: unknown = await response.json();
    if (!bucket || typeof bucket !== 'object' || !('id' in bucket) || bucket.id !== this.bucket || !('public' in bucket) || bucket.public !== true) {
      throw new Error('ถังรูป Supabase ต้องเป็น public');
    }
    const limit = 'file_size_limit' in bucket ? bucket.file_size_limit : null;
    const mimeTypes = 'allowed_mime_types' in bucket ? bucket.allowed_mime_types : null;
    if (typeof limit !== 'number' || limit < 1 || limit > 3_000_000 || !Array.isArray(mimeTypes) || !['image/jpeg', 'image/webp'].every(type => mimeTypes.includes(type))) {
      throw new Error('ถังรูป Supabase ต้องจำกัดไฟล์ไม่เกิน 3 MB และรับเฉพาะ JPEG/WebP');
    }
  }

  async head(key: string): Promise<{ size: number } | null> {
    const response = await this.request(`${this.base}/object/public/${this.objectPath(key)}`, {
      method: 'HEAD', headers: this.headers(), signal: AbortSignal.timeout(30_000), redirect: 'manual',
    });
    if (response.status === 400 || response.status === 404) return null;
    if (!response.ok) throw new Error('ตรวจสอบไฟล์รูป Supabase ไม่สำเร็จ');
    const size = Number(response.headers.get('Content-Length'));
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('ขนาดไฟล์รูปไม่ถูกต้อง');
    return { size };
  }

  async get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null> {
    const response = await this.request(`${this.base}/object/public/${this.objectPath(key)}`, {
      headers: this.headers(), signal: AbortSignal.timeout(30_000), redirect: 'manual',
    });
    if (response.status === 400 || response.status === 404) return null;
    if (!response.ok || !response.body) throw new Error('อ่านไฟล์รูป Supabase ไม่สำเร็จ');
    return { body: response.body, httpMetadata: { contentType: response.headers.get('Content-Type') || undefined } };
  }

  async put(key: string, bytes: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<void> {
    await this.assertSafeBucket();
    const type = options?.httpMetadata?.contentType;
    if (!type || !['image/jpeg', 'image/webp'].includes(type) || bytes.byteLength > 3_000_000) throw new Error('รูปต้องเป็น JPEG/WebP และไม่เกิน 3 MB');
    const response = await this.request(`${this.base}/object/${this.objectPath(key)}`, {
      method: 'POST', headers: this.headers({ 'Content-Type': type, 'x-upsert': 'false', 'Cache-Control': 'public, max-age=31536000' }),
      body: new Uint8Array(bytes).buffer, signal: AbortSignal.timeout(60_000), redirect: 'manual',
    });
    if (!response.ok) throw new Error(`อัปโหลดรูป Supabase ไม่สำเร็จ (${response.status})`);
    await response.body?.cancel();
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const key of new Set(Array.isArray(keys) ? keys : [keys])) {
      const response = await this.request(`${this.base}/object/${this.objectPath(key)}`, {
        method: 'DELETE', headers: this.headers(), signal: AbortSignal.timeout(30_000), redirect: 'manual',
      });
      if (!response.ok && response.status !== 404) throw new Error('ลบรูป Supabase ไม่สำเร็จ');
      await response.body?.cancel();
    }
  }
}

export function supabaseImageStore(env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY' | 'SUPABASE_IMAGE_BUCKET'>): SupabaseImageStore {
  return new SupabaseImageStore(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, env.SUPABASE_IMAGE_BUCKET);
}
