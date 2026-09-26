// Keep the catalog independent of the object-storage provider. The keys in D1
// remain stable if the provider changes.
export interface ImageStore {
  head(key: string): Promise<{ size: number } | null>;
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  put(key: string, bytes: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
}
