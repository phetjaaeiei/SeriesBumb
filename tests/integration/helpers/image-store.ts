import type { ImageStore } from '../../../src/lib/services/image-store';

export class MemoryImageStore implements ImageStore {
  private objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();

  async head(key: string): Promise<{ size: number } | null> {
    const object = this.objects.get(key);
    return object ? { size: object.bytes.length } : null;
  }

  async get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null> {
    const object = this.objects.get(key);
    if (!object) return null;
    const response = new Response(new Uint8Array(object.bytes).buffer);
    return { body: response.body!, httpMetadata: { contentType: object.contentType } };
  }

  async put(key: string, bytes: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<void> {
    this.objects.set(key, { bytes: new Uint8Array(bytes), contentType: options?.httpMetadata?.contentType });
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
}
