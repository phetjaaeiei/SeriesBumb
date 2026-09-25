import { closeSync, openSync, readFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  atomicJson, format, hash, identifier, literal, query, readManifest, root, sameSchema, tableSchemas,
  type BackupRow, type BackupTable, type DbOptions, type Manifest,
} from './d1-common.ts';

const usage = `Usage: node --experimental-strip-types scripts/restore.ts --from /secure/backup --database seriesbumb-new --confirm-database seriesbumb-new --writes-paused

Restores JSON chunks into an EMPTY, MIGRATED D1 database. Remote D1 is used by default.
It saves a state file in the backup directory and resumes by running the same command again.
Options: --local [--persist-to DIR] for an isolated local D1; --max-writes N (default 80000); --help.
Keep all application writes paused until the restore and search rebuild finish.`;
const maxSqlBytes = 90_000; // D1 permits at most 100,000 bytes per SQL statement.
const deferredTapeColumns = new Set(['coverImageId', 'ogSourceImageId']);

interface Options { db: DbOptions; from: string; maxWrites: number; targetId: string }
interface State {
  format: typeof format;
  manifestHash: string;
  database: string;
  targetId: string;
  nextStep: number;
  writtenByUtcDay: Record<string, number>;
  complete: boolean;
}
interface Step { kind: 'insert' | 'patch'; table: BackupTable; file: string; start: number; end: number }

function options(args: string[]): Options | null {
  if (args.includes('--help')) { console.log(usage); return null; }
  let database = '';
  let confirmation = '';
  let from = '';
  let persistTo: string | undefined;
  let local = false;
  let writesPaused = false;
  let maxWrites = 80_000;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--local') local = true;
    else if (arg === '--writes-paused') writesPaused = true;
    else if (arg === '--database') database = args[++i] ?? '';
    else if (arg === '--confirm-database') confirmation = args[++i] ?? '';
    else if (arg === '--from') from = args[++i] ?? '';
    else if (arg === '--persist-to') persistTo = args[++i] ?? '';
    else if (arg === '--max-writes') maxWrites = Number(args[++i]);
    else throw new Error(`Unknown option: ${arg}\n${usage}`);
  }
  if (!database || database !== confirmation || !from || (!local && !writesPaused) || (persistTo && !local)
    || !Number.isSafeInteger(maxWrites) || maxWrites < 1 || maxWrites > 80_000) throw new Error(usage);
  let targetId = local ? `local:${resolve(persistTo ?? join(root, '.wrangler'))}` : '';
  if (!local) {
    const config = JSON.parse(readFileSync(join(root, 'wrangler.jsonc'), 'utf8')) as {
      d1_databases?: { binding: string; database_name: string; database_id: string }[];
    };
    const binding = config.d1_databases?.find(item => item.binding === database || item.database_name === database);
    if (!binding?.database_id || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(binding.database_id)) {
      throw new Error(`Configure a real database_id for ${database} in wrangler.jsonc before restoring.`);
    }
    targetId = binding.database_id;
  }
  return { db: { database, local, persistTo }, from: resolve(from), maxWrites, targetId };
}

function loadRows(directory: string, step: Pick<Step, 'table' | 'file'>): BackupRow[] {
  const contents = readFileSync(join(directory, step.file), 'utf8');
  const chunk = step.table.chunks.find(item => item.file === step.file);
  if (!chunk || hash(contents) !== chunk.sha256) throw new Error(`Backup checksum mismatch: ${step.file}`);
  const rows = JSON.parse(contents) as BackupRow[];
  if (!Array.isArray(rows) || rows.length !== chunk.count) throw new Error(`Invalid backup chunk: ${step.file}`);
  return rows;
}

function validateBackup(directory: string, manifest: Manifest): void {
  const seen = new Set<string>();
  for (const table of manifest.tables) {
    identifier(table.name);
    if (seen.has(table.name) || !Array.isArray(table.columns) || !Array.isArray(table.chunks)) throw new Error('Invalid backup table list.');
    seen.add(table.name);
    table.columns.forEach(column => identifier(column.name));
    let total = 0;
    for (let index = 0; index < table.chunks.length; index++) {
      const chunk = table.chunks[index];
      if (chunk.file !== `${table.name}/${String(index).padStart(6, '0')}.json`) throw new Error(`Invalid chunk path: ${chunk.file}`);
      const rows = loadRows(directory, { table, file: chunk.file });
      const rowids = new Set<string>();
      for (const row of rows) {
        if (typeof row.rowid !== 'string' || !/^-?\d+$/.test(row.rowid) || rowids.has(row.rowid)) throw new Error(`Invalid rowid in ${chunk.file}`);
        rowids.add(row.rowid);
        if (!row.values || Object.keys(row.values).length !== table.columns.length) throw new Error(`Invalid columns in ${chunk.file}`);
        for (const column of table.columns) {
          const value = row.values[column.name];
          if (value !== null && typeof value !== 'string' && typeof value !== 'number') throw new Error(`Unsupported value in ${chunk.file}`);
          if (typeof value === 'number') literal(value);
        }
      }
      total += rows.length;
    }
    if (total !== table.count) throw new Error(`Row count mismatch in ${table.name}`);
  }
}

function restoreOrder(db: DbOptions, manifest: Manifest): BackupTable[] {
  const byName = new Map(manifest.tables.map(table => [table.name, table]));
  const deps = new Map<string, Set<string>>();
  for (const table of manifest.tables) {
    const foreignKeys = query<{ table: string; from: string }>(db, `PRAGMA foreign_key_list(${identifier(table.name)})`).results;
    const parents = new Set<string>();
    for (const fk of foreignKeys) {
      if (table.name === 'tape' && deferredTapeColumns.has(fk.from)) continue;
      if (!byName.has(fk.table)) throw new Error(`Unknown FK dependency ${table.name} -> ${fk.table}`);
      parents.add(fk.table);
    }
    deps.set(table.name, parents);
  }
  const ordered: BackupTable[] = [];
  while (deps.size) {
    const ready = [...deps].filter(([, parents]) => [...parents].every(parent => !deps.has(parent)))
      .map(([name]) => name).sort();
    if (!ready.length) throw new Error('Foreign key cycle is not supported by this restore script.');
    for (const name of ready) { ordered.push(byName.get(name)!); deps.delete(name); }
  }
  // A migrated database already contains the site_stats seed row. Restore its snapshot last.
  return [...ordered.filter(table => table.name !== 'site_stats'), ...ordered.filter(table => table.name === 'site_stats')];
}

function insertSql(table: BackupTable, rows: BackupRow[]): string {
  const cols = table.columns.map(column => column.name);
  const payload = rows.map(row => [row.rowid, ...cols.map(name =>
    table.name === 'tape' && deferredTapeColumns.has(name) ? null : row.values[name])]);
  const select = ["CAST(json_extract(value, '$[0]') AS INTEGER)",
    ...cols.map((_, index) => `json_extract(value, '$[${index + 1}]')`)].join(', ');
  const conflict = table.name === 'site_stats'
    ? `ON CONFLICT DO UPDATE SET ${cols.map(name => `${identifier(name)} = excluded.${identifier(name)}`).join(', ')}`
    : 'ON CONFLICT DO NOTHING';
  return `INSERT INTO ${identifier(table.name)} (rowid, ${cols.map(identifier).join(', ')}) SELECT ${select} FROM json_each(${literal(JSON.stringify(payload))}) WHERE true ${conflict}`;
}

function patchSql(rows: BackupRow[]): string {
  const payload = rows.map(row => [row.rowid, row.values.coverImageId, row.values.ogSourceImageId]);
  return `WITH updates(id, cover, og) AS (
    SELECT CAST(json_extract(value, '$[0]') AS INTEGER), json_extract(value, '$[1]'), json_extract(value, '$[2]')
    FROM json_each(${literal(JSON.stringify(payload))})
  ) UPDATE tape SET coverImageId = (SELECT cover FROM updates WHERE id = tape.rowid),
    ogSourceImageId = (SELECT og FROM updates WHERE id = tape.rowid)
    WHERE rowid IN (SELECT id FROM updates)`;
}

function splitRows(rows: BackupRow[], buildSql: (batch: BackupRow[]) => string): [number, number][] {
  const spans: [number, number][] = [];
  for (let start = 0; start < rows.length;) {
    let end = start + 1;
    if (Buffer.byteLength(buildSql(rows.slice(start, end)), 'utf8') > maxSqlBytes) {
      throw new Error(`A backup row exceeds the D1 100 KB SQL limit; cannot safely restore rowid ${rows[start].rowid}.`);
    }
    while (end < rows.length && Buffer.byteLength(buildSql(rows.slice(start, end + 1)), 'utf8') <= maxSqlBytes) end++;
    spans.push([start, end]);
    start = end;
  }
  return spans;
}

function stepsFor(directory: string, ordered: BackupTable[]): Step[] {
  const steps: Step[] = [];
  for (const table of ordered) {
    for (const chunk of table.chunks) {
      const rows = loadRows(directory, { table, file: chunk.file });
      for (const [start, end] of splitRows(rows, batch => insertSql(table, batch))) {
        steps.push({ kind: 'insert', table, file: chunk.file, start, end });
      }
    }
  }
  const tape = ordered.find(table => table.name === 'tape');
  if (tape) for (const chunk of tape.chunks) {
    const rows = loadRows(directory, { table: tape, file: chunk.file }).filter(row => row.values.coverImageId || row.values.ogSourceImageId);
    for (const [start, end] of splitRows(rows, patchSql)) steps.push({ kind: 'patch', table: tape, file: chunk.file, start, end });
  }
  return steps;
}

function rowsForStep(directory: string, step: Step): BackupRow[] {
  const rows = loadRows(directory, step);
  const selected = step.kind === 'patch' ? rows.filter(row => row.values.coverImageId || row.values.ogSourceImageId) : rows;
  return selected.slice(step.start, step.end);
}

function targetRows(db: DbOptions, table: BackupTable, rows: BackupRow[]): Map<string, Record<string, unknown>> {
  const ids = rows.map(row => row.rowid).join(', ');
  const found = query<Record<string, unknown>>(db,
    `SELECT CAST(rowid AS TEXT) AS "__backup_rowid__", * FROM ${identifier(table.name)} WHERE rowid IN (${ids})`).results;
  return new Map(found.map(row => [String(row.__backup_rowid__), row]));
}

function rowMatches(table: BackupTable, expected: BackupRow, actual: Record<string, unknown> | undefined, deferred: boolean): boolean {
  if (!actual) return false;
  return table.columns.every(column => {
    const wanted = table.name === 'tape' && !deferred && deferredTapeColumns.has(column.name)
      ? null : expected.values[column.name];
    return actual[column.name] === wanted;
  });
}

function applyStep(db: DbOptions, directory: string, step: Step): number {
  const rows = rowsForStep(directory, step);
  const before = targetRows(db, step.table, rows);
  const deferred = step.kind === 'patch';
  if (rows.every(row => rowMatches(step.table, row, before.get(row.rowid), deferred))) return 0;
  if (step.kind === 'insert' && step.table.name !== 'site_stats') {
    for (const row of rows) {
      const existing = before.get(row.rowid);
      if (existing && !rowMatches(step.table, row, existing, false)) throw new Error(`Conflicting ${step.table.name} rowid ${row.rowid}; restore stopped.`);
    }
  }
  if (step.kind === 'patch') {
    for (const row of rows) {
      if (!rowMatches(step.table, row, before.get(row.rowid), false)
        && !rowMatches(step.table, row, before.get(row.rowid), true)) {
        throw new Error(`Conflicting tape rowid ${row.rowid}; restore stopped.`);
      }
    }
  }
  const result = query(db, step.kind === 'patch' ? patchSql(rows) : insertSql(step.table, rows));
  // Wrangler's local D1 JSON output omits rows_written; remote D1 reports the billed value.
  const written = db.local ? rows.length : result.meta.rows_written;
  if (typeof written !== 'number' || written < 0) throw new Error('Wrangler did not report meta.rows_written. Check D1 before resuming.');
  const after = targetRows(db, step.table, rows);
  if (!rows.every(row => rowMatches(step.table, row, after.get(row.rowid), deferred))) {
    throw new Error(`Read-back verification failed after restoring ${step.table.name}.`);
  }
  return written;
}

function preflightEmpty(db: DbOptions, manifest: Manifest): void {
  for (const table of manifest.tables) {
    const count = query<{ count: number }>(db, `SELECT COUNT(*) AS count FROM ${identifier(table.name)}`).results[0]?.count;
    if (table.name === 'site_stats') {
      if (count !== 1) throw new Error('Target site_stats must contain only the migrated seed row.');
    } else if (count !== 0) throw new Error(`Target table ${table.name} is not empty. Use a fresh migrated D1 database.`);
  }
  const fts = query<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM search_fts').results[0]?.count;
  if (fts !== 0) throw new Error('Target search_fts is not empty.');
}

function finish(db: DbOptions, manifest: Manifest): void {
  for (const table of manifest.tables) {
    const count = query<{ count: number }>(db, `SELECT COUNT(*) AS count FROM ${identifier(table.name)}`).results[0]?.count;
    if (count !== table.count) throw new Error(`Final row count mismatch in ${table.name}: ${count} vs ${table.count}`);
  }
  const violations = query(db, 'PRAGMA foreign_key_check').results;
  if (violations.length) throw new Error(`Foreign key violations after restore: ${JSON.stringify(violations.slice(0, 3))}`);
}

function main(): void {
  const parsed = options(process.argv.slice(2));
  if (!parsed) return;
  const { db, from, maxWrites, targetId } = parsed;
  const manifestPath = join(from, 'manifest.json');
  const manifestText = readFileSync(manifestPath, 'utf8');
  const manifest = readManifest(from);
  validateBackup(from, manifest); // Check all chunks before any D1 writes.
  if (!sameSchema(manifest.tables, tableSchemas(db))) throw new Error('Target D1 schema differs from the backup. Apply the matching migrations first.');
  const ordered = restoreOrder(db, manifest);
  const steps = stepsFor(from, ordered); // Also checks that every SQL statement fits D1's limit.
  const statePath = join(from, `.restore-${hash(targetId).slice(0, 12)}.json`);
  const lockPath = `${statePath}.lock`;
  const lock = openSync(lockPath, 'wx', 0o600);
  try {
    let state: State;
    try {
      state = JSON.parse(readFileSync(statePath, 'utf8')) as State;
      if (state.format !== format || state.manifestHash !== hash(manifestText) || state.database !== db.database || state.targetId !== targetId
        || !Number.isSafeInteger(state.nextStep) || state.nextStep < 0 || state.nextStep > steps.length) {
        throw new Error('Restore state does not match this backup or target.');
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        preflightEmpty(db, manifest);
        state = { format, manifestHash: hash(manifestText), database: db.database, targetId,
          nextStep: 0, writtenByUtcDay: {}, complete: false };
        atomicJson(statePath, state);
      } else throw error;
    }
    if (state.complete) { console.log('Restore already complete.'); return; }
    const indexCounts = new Map(ordered.map(table => [table.name,
      query(db, `PRAGMA index_list(${identifier(table.name)})`).results.length]));
    for (let index = state.nextStep; index < steps.length; index++) {
      const step = steps[index];
      const today = new Date().toISOString().slice(0, 10); // D1 Free quota resets at 00:00 UTC.
      const used = state.writtenByUtcDay[today] ?? 0;
      const estimate = (step.end - step.start) * (1 + (indexCounts.get(step.table.name) ?? 0)) * 2;
      if (used + estimate > maxWrites) {
        console.log(`Stopped before the ${maxWrites.toLocaleString()} write budget (${used.toLocaleString()} counted today). Re-run after 00:00 UTC.`);
        return;
      }
      const written = applyStep(db, from, step);
      state.writtenByUtcDay[today] = used + written;
      state.nextStep = index + 1;
      atomicJson(statePath, state);
      console.log(`${index + 1}/${steps.length} ${step.kind} ${step.table.name}: +${written} rows written (${state.writtenByUtcDay[today]} today)`);
      if (state.writtenByUtcDay[today] >= maxWrites) {
        console.log('Daily restore budget reached. Re-run after 00:00 UTC.');
        return;
      }
    }
    finish(db, manifest);
    state.complete = true;
    atomicJson(statePath, state);
    console.log('Restore complete. In /admin, run “สร้างดัชนีใหม่ทั้งหมด” before reopening writes. Restore R2 images separately.');
  } finally {
    closeSync(lock);
    unlinkSync(lockPath);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
