// Consistent, redacted D1 export for off-site backups (nightly GitHub Action, or by hand).
//
//   node --experimental-strip-types scripts/backup-export.ts --database seriesbumb --remote --out ~/SeriesBumb-backups/d1
//
// Writes seriesbumb-<UTC date>.sql (data only, INSERT statements) and a .manifest.json with row counts
// and the SHA-256 of the dump. Restore with scripts/restore-export.ts into a fresh, migrated database.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { exportArgs, insertCounts, isInsideDirectory, lossyTextQuery, tablesToExport } from './lib/backup-export.ts';
import { parseCreateTable } from './lib/sqlite-schema.ts';

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
  if (result.status !== 0) {
    // In --json mode wrangler reports errors on stdout as {"error":{"text":…}}; only that text is shown.
    let detail = result.stderr.split('\n').slice(-8).join('\n');
    try { detail = (JSON.parse(result.stdout) as { error?: { text?: string } }).error?.text ?? detail; } catch { /* not JSON */ }
    throw new Error(`wrangler ${commandArgs.slice(0, 3).join(' ')} failed: ${detail}`);
  }
  return result.stdout;
}

function query<T>(sql: string): T[] {
  const parsed = JSON.parse(wrangler(['d1', 'execute', database, `--${where}`, '--json', '--command', sql])) as { results: T[] }[];
  return parsed[0]?.results ?? [];
}

const directory = resolve(out);
// The dump holds member names and emails; this repository is public.
if (isInsideDirectory(root, directory)) throw new Error(`--out must be outside the repository (for example ~/SeriesBumb-backups/d1), not ${directory}`);

const schema = query<{ name: string; sql: string | null }>("SELECT name, sql FROM sqlite_master WHERE type = 'table'");
const tables = tablesToExport(schema.map((row) => row.name));
const [tokens] = query<{ count: number }>('SELECT COUNT(*) AS count FROM account WHERE accessToken IS NOT NULL OR refreshToken IS NOT NULL OR idToken IS NOT NULL OR password IS NOT NULL');
if ((tokens?.count ?? 0) > 0) throw new Error('account still holds provider tokens or passwords; refusing to export them (sign-in clears them; see migration 0011)');

mkdirSync(directory, { recursive: true, mode: 0o700 });
chmodSync(directory, 0o700);
const stamp = new Date().toISOString().slice(0, 10);
const dumpPath = join(directory, `${database}-${stamp}.sql`);
if (existsSync(dumpPath)) throw new Error(`${dumpPath} already exists`);
// Text that D1 export cannot round-trip (see lossyTextQuery); recorded so a restore can be checked.
const lossyParts = tables
  .map((table) => ({ table, columns: parseCreateTable(schema.find((row) => row.name === table)?.sql ?? '()').columns.filter((column) => /TEXT/iu.test(column.type)).map((column) => column.name) }))
  .filter((entry) => entry.columns.length)
  .map((entry) => `SELECT '${entry.table}' AS tbl, rowid FROM (${lossyTextQuery(entry.table, entry.columns)})`);
// D1 caps compound SELECTs at a few terms, so check five tables per query.
const lossyRows: { tbl: string; rowid: number }[] = [];
for (let i = 0; i < lossyParts.length; i += 5) lossyRows.push(...query<{ tbl: string; rowid: number }>(lossyParts.slice(i, i + 5).join(' UNION ALL ')));

wrangler(exportArgs(database, where, tables, dumpPath));
try {
  chmodSync(dumpPath, 0o600);
  const dump = readFileSync(dumpPath, 'utf8');
  const counts = insertCounts(dump);
  const leaked = Object.keys(counts).filter((table) => !tables.includes(table));
  if (leaked.length) throw new Error(`dump contains unexpected tables: ${leaked.join(', ')}`);
  const manifest = {
    database, createdAt: new Date().toISOString(), format: 'd1-export-data-only-v1',
    tables: Object.fromEntries(tables.map((table) => [table, counts[table] ?? 0])),
    bytes: Buffer.byteLength(dump), sha256: createHash('sha256').update(dump).digest('hex'),
    // Rows whose text mixes a real newline with a literal \n or \r: re-check them after a restore.
    lossyRows: lossyRows.map((row) => ({ table: row.tbl, rowid: row.rowid })),
  };
  writeFileSync(join(directory, `${database}-${stamp}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  if (lossyRows.length) console.warn(`warning: ${lossyRows.length} row(s) mix a newline with a literal \\n or \\r and will not restore byte-for-byte; they are listed in the manifest`);
  console.log(`exported ${tables.length} tables, ${Object.values(manifest.tables).reduce((a, b) => a + b, 0)} rows, ${manifest.bytes} bytes → ${dumpPath}`);
} catch (error) {
  // Never leave an unvalidated plaintext dump behind.
  rmSync(dumpPath, { force: true });
  throw error;
}
