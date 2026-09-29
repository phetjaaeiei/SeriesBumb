// Restores a data-only export (scripts/backup-export.ts) into a fresh database that already has every
// migration applied. Refuses to write into a database that holds catalog or member data.
// D1 Free allows 100k rows written per day, so a large dump is imported in parts, parents first; run
// the same command again the next day (after 07:00 Thailand time) to continue. Progress is kept in
// <dump>.restore-state.json next to the dump.
//
//   npx wrangler d1 create seriesbumb-restore          # then add it to a wrangler env, or use --local
//   npx wrangler d1 migrations apply seriesbumb-restore --remote
//   node --experimental-strip-types scripts/restore-export.ts --database seriesbumb-restore --remote --file ~/SeriesBumb-backups/d1/restore/seriesbumb-2026-09-28.sql
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { planRestoreParts, splitDumpByTable } from './lib/restore-plan.ts';
import { parseCreateTable } from './lib/sqlite-schema.ts';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const value = (name: string) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const database = value('database') ?? '';
const where = args.includes('--local') ? 'local' : args.includes('--remote') ? 'remote' : null;
const file = value('file');
const persistTo = value('persist-to');
// Leave headroom under the 100k/day limit for the site's own writes.
const budget = Number(value('max-writes') ?? 80_000);
if (!database || !where || !file || (persistTo && where !== 'local') || !Number.isSafeInteger(budget) || budget < 1) {
  console.error('Usage: restore-export.ts --database <name> (--remote | --local [--persist-to DIR]) --file <dump.sql> [--max-writes 80000] [--into-production]');
  process.exit(2);
}
if (where === 'remote' && database === 'seriesbumb' && !args.includes('--into-production')) {
  throw new Error('Restore into a new database and switch the binding; pass --into-production only if the production database was recreated empty on purpose.');
}

const location = [`--${where}`, ...(persistTo ? ['--persist-to', persistTo] : [])];
function wrangler(commandArgs: string[]): string {
  const result = spawnSync(join(root, 'node_modules', '.bin', 'wrangler'), commandArgs, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, CI: 'true' } });
  if (result.status !== 0) {
    // In --json mode wrangler reports errors on stdout as {"error":{"text":…}}; only that text is shown.
    let detail = result.stderr.split('\n').slice(-8).join('\n');
    try { detail = (JSON.parse(result.stdout) as { error?: { text?: string } }).error?.text ?? detail; } catch { /* not JSON */ }
    throw new Error(`wrangler ${commandArgs.slice(0, 3).join(' ')} failed: ${detail}`);
  }
  return result.stdout;
}
const query = <T>(sql: string): T[] => (JSON.parse(wrangler(['d1', 'execute', database, ...location, '--json', '--command', sql])) as { results: T[] }[])[0]?.results ?? [];
const quoted = (table: string) => `"${table.replaceAll('"', '""')}"`;
const countOf = (table: string) => query<{ count: number }>(`SELECT COUNT(*) AS count FROM ${quoted(table)}`)[0]?.count ?? 0;

const dumpPath = resolve(file);
const manifestPath = dumpPath.replace(/\.sql$/u, '.manifest.json');
const statePath = `${dumpPath}.restore-state.json`;
if (!existsSync(manifestPath)) throw new Error(`missing ${manifestPath}`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { format: string; sha256: string; tables: Record<string, number>; lossyRows?: { table: string; rowid: number }[] };
const dump = readFileSync(dumpPath, 'utf8');
if (manifest.format !== 'd1-export-data-only-v1') throw new Error(`unknown backup format ${manifest.format}`);
if (createHash('sha256').update(dump).digest('hex') !== manifest.sha256) throw new Error('checksum mismatch: the dump does not match its manifest');

const migrations = query<{ count: number }>('SELECT COUNT(*) AS count FROM d1_migrations')[0]?.count ?? 0;
if (!migrations) throw new Error(`apply migrations to ${database} first`);

// Foreign-key parents and index counts of the target schema (pragma_* functions are blocked on D1).
const references = new Map(query<{ name: string; sql: string | null }>("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql IS NOT NULL")
  .map((row) => [row.name, parseCreateTable(row.sql!).references] as const));
const indexCounts = new Map(query<{ tbl: string; n: number }>("SELECT tbl_name AS tbl, COUNT(*) AS n FROM sqlite_master WHERE type = 'index' GROUP BY tbl_name").map((row) => [row.tbl, row.n]));
const parts = planRestoreParts(splitDumpByTable(dump), references, indexCounts, budget);
const total = parts.reduce((sum, part) => sum + part.estimatedWrites, 0);

const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) as { database: string; sha256: string; completedParts: number } : null;
if (state && (state.database !== database || state.sha256 !== manifest.sha256)) throw new Error(`${statePath} belongs to another restore; remove it to start over`);
let completed = state?.completedParts ?? 0;

// Tables still to import must be empty. On a fresh start that means every table in the backup.
const pendingTables = parts.slice(completed).flatMap((part) => part.tables).filter((table) => table !== 'site_stats');
const occupied = pendingTables.filter((table) => countOf(table) > 0);
if (occupied.length) throw new Error(`${database} already has data in: ${occupied.join(', ')}`);
console.log(`${parts.length} part(s), about ${total} row writes in total; ${parts.length - completed} part(s) left.`);

let spent = 0;
while (completed < parts.length && spent + parts[completed].estimatedWrites <= budget) {
  const part = parts[completed];
  // Migrations seed the singleton counters row; the backup carries the real one.
  if (part.tables.includes('site_stats')) query('DELETE FROM site_stats');
  const partPath = `${dumpPath}.part-${completed + 1}.sql`;
  writeFileSync(partPath, `PRAGMA defer_foreign_keys=TRUE;\n${part.lines.join('\n')}\n`, { mode: 0o600 });
  try { wrangler(['d1', 'execute', database, ...location, '--file', partPath]); }
  finally { rmSync(partPath, { force: true }); }
  const mismatched = part.tables.filter((table) => countOf(table) !== manifest.tables[table]);
  if (mismatched.length) throw new Error(`row counts differ after importing part ${completed + 1}: ${mismatched.join(', ')}`);
  completed += 1;
  spent += part.estimatedWrites;
  writeFileSync(statePath, `${JSON.stringify({ database, sha256: manifest.sha256, completedParts: completed })}\n`, { mode: 0o600 });
  console.log(`imported part ${completed}/${parts.length}: ${part.tables.join(', ')} (about ${part.estimatedWrites} row writes)`);
}

if (completed < parts.length) {
  console.log(`Stopped to stay within about ${budget} row writes today. Run the same command again after 07:00 (Thailand time) to import the next part.`);
} else {
  rmSync(statePath, { force: true });
  const lossy = manifest.lossyRows?.length ?? 0;
  console.log(`restored ${parts.flatMap((part) => part.tables).length} tables into ${database}.${lossy ? ` ${lossy} row(s) listed in the manifest under lossyRows mixed a newline with a literal \\n or \\r; check them by hand.` : ''} Next: open /admin and run "สร้างดัชนีใหม่ทั้งหมด" (search index), restore Supabase files separately, and ask members to sign in again (sessions are never backed up).`);
}
