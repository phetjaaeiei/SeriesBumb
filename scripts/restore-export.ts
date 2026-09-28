// Restores a data-only export (scripts/backup-export.ts) into a fresh database that already has every
// migration applied. Refuses to write into a database that holds catalog or member data.
//
//   npx wrangler d1 create seriesbumb-restore          # then add it to a wrangler env, or use --local
//   npx wrangler d1 migrations apply seriesbumb-restore --remote
//   node --experimental-strip-types scripts/restore-export.ts --database seriesbumb-restore --remote --file backups/seriesbumb-2026-09-28.sql
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const value = (name: string) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const database = value('database') ?? '';
const where = args.includes('--local') ? 'local' : args.includes('--remote') ? 'remote' : null;
const file = value('file');
const persistTo = value('persist-to');
if (!database || !where || !file || (persistTo && where !== 'local')) {
  console.error('Usage: restore-export.ts --database <name> (--remote | --local [--persist-to DIR]) --file <dump.sql> [--into-production]');
  process.exit(2);
}
if (where === 'remote' && database === 'seriesbumb' && !args.includes('--into-production')) {
  throw new Error('Restore into a new database and switch the binding; pass --into-production only if the production database was recreated empty on purpose.');
}

const location = [`--${where}`, ...(persistTo ? ['--persist-to', persistTo] : [])];
function wrangler(commandArgs: string[]): string {
  const result = spawnSync(join(root, 'node_modules', '.bin', 'wrangler'), commandArgs, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, CI: 'true' } });
  if (result.status !== 0) throw new Error(`wrangler ${commandArgs.slice(0, 3).join(' ')} failed:\n${result.stderr.split('\n').slice(-8).join('\n')}`);
  return result.stdout;
}
const query = <T>(sql: string): T[] => (JSON.parse(wrangler(['d1', 'execute', database, ...location, '--json', '--command', sql])) as { results: T[] }[])[0]?.results ?? [];

const dumpPath = resolve(file);
const manifestPath = dumpPath.replace(/\.sql$/u, '.manifest.json');
if (!existsSync(manifestPath)) throw new Error(`missing ${manifestPath}`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { format: string; sha256: string; tables: Record<string, number> };
const dump = readFileSync(dumpPath, 'utf8');
if (manifest.format !== 'd1-export-data-only-v1') throw new Error(`unknown backup format ${manifest.format}`);
if (createHash('sha256').update(dump).digest('hex') !== manifest.sha256) throw new Error('checksum mismatch: the dump does not match its manifest');

const migrations = query<{ count: number }>('SELECT COUNT(*) AS count FROM d1_migrations')[0]?.count ?? 0;
if (!migrations) throw new Error(`apply migrations to ${database} first`);
const tables = Object.keys(manifest.tables);
const occupied = tables.filter((table) => table !== 'site_stats')
  .filter((table) => (query<{ count: number }>(`SELECT COUNT(*) AS count FROM "${table.replaceAll('"', '')}"`)[0]?.count ?? 0) > 0);
if (occupied.length) throw new Error(`${database} already has data in: ${occupied.join(', ')}`);

// Migrations seed the singleton counters row; the backup carries the real one.
if (tables.includes('site_stats')) query('DELETE FROM site_stats');
wrangler(['d1', 'execute', database, ...location, '--file', dumpPath]);

const mismatched = tables.filter((table) => (query<{ count: number }>(`SELECT COUNT(*) AS count FROM "${table.replaceAll('"', '')}"`)[0]?.count ?? 0) !== manifest.tables[table]);
if (mismatched.length) throw new Error(`row counts differ after restore: ${mismatched.join(', ')}`);
console.log(`restored ${tables.length} tables into ${database}. Next: open /admin and run "สร้างดัชนีใหม่ทั้งหมด" (search index), restore Supabase files separately, and ask members to sign in again (sessions are never backed up).`);
