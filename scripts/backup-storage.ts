// Copies Supabase Storage buckets (public images, private audio) to a local folder, incrementally,
// with a SHA-256 manifest per bucket. Run by the owner on a trusted machine; downloads count
// against Supabase egress (Free: 5 GB/month), so use --dry-run first to see the size.
//
//   SUPABASE_URL=https://<project>.supabase.co SUPABASE_SECRET_KEY=sb_secret_... \
//     node --experimental-strip-types scripts/backup-storage.ts --out ~/SeriesBumb-backups/storage --bucket SeriesBumbImages --bucket SeriesBumb [--dry-run]
import { resolve } from 'node:path';
import { backupBucket } from './lib/storage-backup.ts';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
const buckets = args.flatMap((arg, index) => (arg === '--bucket' && args[index + 1] ? [args[index + 1]] : []));
const projectUrl = process.env.SUPABASE_URL?.replace(/\/+$/u, '');
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!out || !buckets.length || !projectUrl || !secretKey) {
  console.error('Usage: SUPABASE_URL=… SUPABASE_SECRET_KEY=… backup-storage.ts --out <dir> --bucket <name> [--bucket <name>] [--dry-run]');
  process.exit(2);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/u.test(projectUrl)) throw new Error('SUPABASE_URL must be https://<project>.supabase.co');

for (const bucket of buckets) {
  const result = await backupBucket({ fetcher: fetch, projectUrl, secretKey, bucket, out: resolve(out), dryRun: args.includes('--dry-run'), log: console.log });
  console.log(`${bucket}: ${result.downloaded} downloaded, ${result.skipped} unchanged`);
}
