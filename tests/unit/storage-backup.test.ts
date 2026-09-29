import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backupBucket, localPath } from '../../scripts/lib/storage-backup';

const files: Record<string, string> = { 'tapes/a/front-full.webp': 'AAAA', 'tapes/a/front-thumb.webp': 'BB', 'logo.jpg': 'CCC' };
let downloads = 0;

// Fake Supabase Storage: folder listing (id null = folder) and authenticated downloads.
const fakeSupabase: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.pathname === '/storage/v1/object/list/Images') {
    const { prefix } = JSON.parse(String(init?.body)) as { prefix: string };
    const names = new Map<string, { name: string; id: string | null; metadata?: { size: number }; updated_at?: string }>();
    for (const [key, body] of Object.entries(files)) {
      if (!key.startsWith(prefix)) continue;
      const [head, ...rest] = key.slice(prefix.length).split('/');
      names.set(head, rest.length ? { name: head, id: null } : { name: head, id: `id-${key}`, metadata: { size: body.length }, updated_at: '2026-09-01T00:00:00Z' });
    }
    return Response.json([...names.values()]);
  }
  const key = decodeURIComponent(url.pathname.replace('/storage/v1/object/authenticated/Images/', ''));
  downloads += 1;
  return key in files ? new Response(files[key]) : new Response('missing', { status: 404 });
};

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); downloads = 0; });

describe('storage backup', () => {
  it('copies every object once with checksums, then only what changed', async () => {
    const out = mkdtempSync(join(tmpdir(), 'storage-backup-'));
    dirs.push(out);
    const options = { fetcher: fakeSupabase, projectUrl: 'https://p.supabase.co', secretKey: 'sb_secret_x', bucket: 'Images', out };
    expect(await backupBucket({ ...options, dryRun: true })).toMatchObject({ listed: 3, downloaded: 0, bytes: 9 });
    expect(downloads).toBe(0);
    expect(await backupBucket(options)).toMatchObject({ listed: 3, downloaded: 3 });
    expect(readFileSync(join(out, 'Images/tapes/a/front-full.webp'), 'utf8')).toBe('AAAA');
    const manifest = JSON.parse(readFileSync(join(out, 'Images/manifest.json'), 'utf8')) as Record<string, { sha256: string }>;
    expect(manifest['logo.jpg'].sha256).toMatch(/^[0-9a-f]{64}$/u);
    downloads = 0;
    expect(await backupBucket(options)).toMatchObject({ downloaded: 0, skipped: 3 });
    expect(downloads).toBe(0);
  });

  it('refuses object keys that would escape the backup folder', () => {
    expect(() => localPath('/backups', 'Images', '../../etc/passwd')).toThrow('unsafe');
    expect(() => localPath('/backups', 'Images', 'a//b')).toThrow('unsafe');
    expect(() => localPath('/backups', 'Images', 'a\\b')).toThrow('unsafe');
    expect(localPath('/backups', 'Images', 'tapes/x.webp')).toBe('/backups/Images/tapes/x.webp');
  });
});
