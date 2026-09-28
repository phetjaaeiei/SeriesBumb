// Incremental, checksummed copy of a Supabase Storage bucket to a local folder
// (used by scripts/backup-storage.ts; tested in tests/unit/storage-backup.test.ts).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

export interface StoredObject { key: string; size: number; updatedAt: string | null }
export interface BucketBackupOptions {
  fetcher: typeof fetch;
  projectUrl: string;
  secretKey: string;
  bucket: string;
  out: string;
  dryRun?: boolean;
  log?: (line: string) => void;
}

const PAGE = 1000;

function headers(secretKey: string, extra?: Record<string, string>): Headers {
  const result = new Headers(extra);
  result.set('apikey', secretKey);
  if (!secretKey.startsWith('sb_secret_')) result.set('Authorization', `Bearer ${secretKey}`);
  return result;
}

/** Local path for an object key, or an error for keys that could escape the backup folder. */
export function localPath(root: string, bucket: string, key: string): string {
  const parts = key.split('/');
  if (!key || parts.some((part) => !part || part === '.' || part === '..' || part.includes('\\') || part.includes('\0'))) throw new Error(`unsafe object key: ${JSON.stringify(key)}`);
  const base = resolve(root, bucket);
  const target = resolve(base, ...parts);
  if (!target.startsWith(base + sep)) throw new Error(`unsafe object key: ${JSON.stringify(key)}`);
  return target;
}

export async function listObjects(options: Pick<BucketBackupOptions, 'fetcher' | 'projectUrl' | 'secretKey' | 'bucket'>, prefix = ''): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const response = await options.fetcher(`${options.projectUrl}/storage/v1/object/list/${encodeURIComponent(options.bucket)}`, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30_000),
      headers: headers(options.secretKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!response.ok) throw new Error(`listing ${options.bucket}/${prefix} failed with HTTP ${response.status}`);
    const items = await response.json() as { name: string; id: string | null; updated_at?: string | null; metadata?: { size?: number } | null }[];
    for (const item of items) {
      if (item.id === null) objects.push(...await listObjects(options, `${prefix}${item.name}/`));
      else objects.push({ key: `${prefix}${item.name}`, size: Number(item.metadata?.size ?? -1), updatedAt: item.updated_at ?? null });
    }
    if (items.length < PAGE) return objects;
  }
}

type Manifest = Record<string, { size: number; sha256: string; updatedAt: string | null }>;

/** Downloads objects that are new or changed since the last run; returns what it did. */
export async function backupBucket(options: BucketBackupOptions): Promise<{ listed: number; downloaded: number; bytes: number; skipped: number }> {
  const log = options.log ?? (() => undefined);
  const manifestPath = join(resolve(options.out, options.bucket), 'manifest.json');
  const manifest: Manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest : {};
  const objects = await listObjects(options);
  const pending = objects.filter((object) => {
    const path = localPath(options.out, options.bucket, object.key);
    const known = manifest[object.key];
    return !known || known.size !== object.size || known.updatedAt !== object.updatedAt || !existsSync(path) || statSync(path).size !== object.size;
  });
  const bytes = pending.reduce((sum, object) => sum + Math.max(0, object.size), 0);
  log(`${options.bucket}: ${objects.length} objects, ${pending.length} new or changed (${(bytes / 1_048_576).toFixed(1)} MB of Supabase egress)`);
  if (options.dryRun) return { listed: objects.length, downloaded: 0, bytes, skipped: objects.length - pending.length };

  for (const object of pending) {
    const path = localPath(options.out, options.bucket, object.key);
    const encoded = object.key.split('/').map(encodeURIComponent).join('/');
    const response = await options.fetcher(`${options.projectUrl}/storage/v1/object/authenticated/${encodeURIComponent(options.bucket)}/${encoded}`, {
      headers: headers(options.secretKey), redirect: 'manual', signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`download of ${options.bucket}/${object.key} failed with HTTP ${response.status}`);
    const body = new Uint8Array(await response.arrayBuffer());
    if (object.size >= 0 && body.byteLength !== object.size) throw new Error(`size mismatch for ${options.bucket}/${object.key}`);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(`${path}.partial`, body, { mode: 0o600 });
    renameSync(`${path}.partial`, path);
    manifest[object.key] = { size: body.byteLength, sha256: createHash('sha256').update(body).digest('hex'), updatedAt: object.updatedAt };
    // Save progress as we go so an interrupted run resumes without re-downloading.
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`, { mode: 0o600 });
  }
  if (!existsSync(manifestPath)) { mkdirSync(dirname(manifestPath), { recursive: true, mode: 0o700 }); writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`, { mode: 0o600 }); }
  return { listed: objects.length, downloaded: pending.length, bytes, skipped: objects.length - pending.length };
}
