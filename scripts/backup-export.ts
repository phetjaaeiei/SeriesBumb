// Consistent, redacted D1 export for off-site backups (nightly GitHub Action, or by hand).
//
//   node --experimental-strip-types scripts/backup-export.ts --database seriesbumb --remote --out backups/
//
// Writes seriesbumb-<UTC date>.sql (data only, INSERT statements) and a .manifest.json with row counts
// and the SHA-256 of the dump. Restore with scripts/restore-export.ts into a fresh, migrated database.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { exportArgs, insertCounts, tablesToExport } from './lib/backup-export.ts';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const value = (name: string) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const database = value('database') ?? '';
const where = args.includes('--local') ? 'local' : args.includes('--remote') ? 'remote' : null;
const out = value('out');
if (!database || !where || !out) {
  console.error('Usage: backup-export.ts --database <name> (--remote | --local) --out <dir>');
  process.exit(2);
}

function wrangler(commandArgs: string[]): string {
  const bin = join(root, 'node_modules', '.bin', 'wrangler');
  const result = spawnSync(bin, commandArgs, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, CI: 'true' } });
  // Never echo stdout: exports carry member names and emails.
  if (result.status !== 0) throw new Error(`wrangler ${commandArgs.slice(0, 3).join(' ')} failed:\n${result.stderr.split('\n').slice(-8).join('\n')}`);
  return result.stdout;
}

function query<T>(sql: string): T[] {
  const parsed = JSON.parse(wrangler(['d1', 'execute', database, `--${where}`, '--json', '--command', sql])) as { results: T[] }[];
  return parsed[0]?.results ?? [];
}

const tables = tablesToExport(query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name));
const [tokens] = query<{ count: number }>('SELECT COUNT(*) AS count FROM account WHERE accessToken IS NOT NULL OR refreshToken IS NOT NULL OR idToken IS NOT NULL OR password IS NOT NULL');
if ((tokens?.count ?? 0) > 0) throw new Error('account still holds provider tokens or passwords; refusing to export them (sign-in clears them; see migration 0011)');

const directory = resolve(out);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().slice(0, 10);
const dumpPath = join(directory, `${database}-${stamp}.sql`);
if (existsSync(dumpPath)) throw new Error(`${dumpPath} already exists`);
wrangler(exportArgs(database, where, tables, dumpPath));

const dump = readFileSync(dumpPath, 'utf8');
const counts = insertCounts(dump);
const leaked = Object.keys(counts).filter((table) => !tables.includes(table));
if (leaked.length) throw new Error(`dump contains unexpected tables: ${leaked.join(', ')}`);
const manifest = {
  database, createdAt: new Date().toISOString(), format: 'd1-export-data-only-v1',
  tables: Object.fromEntries(tables.map((table) => [table, counts[table] ?? 0])),
  bytes: Buffer.byteLength(dump), sha256: createHash('sha256').update(dump).digest('hex'),
};
writeFileSync(join(directory, `${database}-${stamp}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
console.log(`exported ${tables.length} tables, ${Object.values(manifest.tables).reduce((a, b) => a + b, 0)} rows, ${manifest.bytes} bytes → ${dumpPath}`);
