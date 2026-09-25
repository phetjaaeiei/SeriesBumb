import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  atomicJson, format, hash, identifier, literal, query, sameSchema, tableSchemas,
  type BackupRow, type BackupTable, type DbOptions, type Manifest,
} from './d1-common.ts';

const usage = `Usage: node --experimental-strip-types scripts/backup.ts --database seriesbumb --out /secure/seriesbumb-YYYY-MM-DD --writes-paused

Backs up ordinary D1 tables to checksummed JSON chunks. Remote D1 is used by default.
Options: --local [--persist-to DIR] for an isolated local D1; --help.
Pause all application writes before a remote backup and keep the output private: it contains OAuth account data.`;
const pageSize = 50;

function options(args: string[]): { db: DbOptions; out: string } | null {
  if (args.includes('--help')) { console.log(usage); return null; }
  let database = '';
  let out = '';
  let persistTo: string | undefined;
  let local = false;
  let writesPaused = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--local') local = true;
    else if (arg === '--writes-paused') writesPaused = true;
    else if (arg === '--database') database = args[++i] ?? '';
    else if (arg === '--out') out = args[++i] ?? '';
    else if (arg === '--persist-to') persistTo = args[++i] ?? '';
    else throw new Error(`Unknown option: ${arg}\n${usage}`);
  }
  if (!database || !out || (!local && !writesPaused) || (persistTo && !local)) throw new Error(usage);
  return { db: { database, local, persistTo }, out: resolve(out) };
}

function tableSummary(db: DbOptions, name: string): { count: number; maxRowid: string | null } {
  const row = query<{ count: number; maxRowid: string | null }>(db,
    `SELECT COUNT(*) AS count, CAST(MAX(rowid) AS TEXT) AS maxRowid FROM ${identifier(name)}`).results[0];
  if (!row || !Number.isSafeInteger(row.count)) throw new Error(`Invalid row count for ${name}`);
  return row;
}

function backupTable(db: DbOptions, out: string, schema: BackupTable): void {
  const start = tableSummary(db, schema.name);
  const tableDir = join(out, schema.name);
  mkdirSync(tableDir, { mode: 0o700 });
  let cursor: string | null = null;
  let saved = 0;
  while (true) {
    const where = cursor === null ? '' : `WHERE rowid > ${cursor}`;
    const rows = query<Record<string, string | number | null>>(db,
      `SELECT CAST(rowid AS TEXT) AS "__backup_rowid__", * FROM ${identifier(schema.name)} ${where} ORDER BY rowid LIMIT ${pageSize}`).results;
    if (!rows.length) break;
    const chunkRows: BackupRow[] = rows.map(row => {
      const rowid = row.__backup_rowid__;
      if (typeof rowid !== 'string' || !/^-?\d+$/.test(rowid)) throw new Error(`Invalid rowid in ${schema.name}`);
      const values: BackupRow['values'] = {};
      for (const col of schema.columns) {
        const value = row[col.name];
        if (value !== null && typeof value !== 'string' && typeof value !== 'number') throw new Error(`Unsupported ${schema.name}.${col.name} value`);
        if (typeof value === 'number') literal(value);
        values[col.name] = value;
      }
      return { rowid, values };
    });
    const file = `${schema.name}/${String(schema.chunks.length).padStart(6, '0')}.json`;
    const contents = `${JSON.stringify(chunkRows)}\n`;
    writeFileSync(join(out, file), contents, { flag: 'wx', mode: 0o600 });
    schema.chunks.push({ file, count: chunkRows.length, sha256: hash(contents) });
    saved += chunkRows.length;
    cursor = chunkRows.at(-1)!.rowid;
    if (rows.length < pageSize) break;
  }
  const end = tableSummary(db, schema.name);
  if (saved !== start.count || end.count !== start.count || end.maxRowid !== start.maxRowid) {
    throw new Error(`${schema.name} changed during backup. Pause writes and start a new backup.`);
  }
  schema.count = saved;
  console.log(`${schema.name}: ${saved} rows`);
}

function main(): void {
  const parsed = options(process.argv.slice(2));
  if (!parsed) return;
  const { db, out } = parsed;
  const foreignKeyErrors = query(db, 'PRAGMA foreign_key_check').results;
  if (foreignKeyErrors.length) throw new Error(`Source D1 has ${foreignKeyErrors.length} foreign key violation(s); repair it before backing up.`);
  const schemas = tableSchemas(db);
  mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
  mkdirSync(out, { mode: 0o700 }); // Refuse to overwrite an earlier backup.
  const tables: BackupTable[] = schemas.map(schema => ({ ...schema, count: 0, chunks: [] }));
  for (const table of tables) backupTable(db, out, table);
  if (!sameSchema(schemas, tableSchemas(db))) throw new Error('D1 schema changed during backup. Start again.');
  if (query(db, 'PRAGMA foreign_key_check').results.length) throw new Error('D1 foreign keys changed during backup. Start again.');
  const manifest: Manifest = { format, createdAt: new Date().toISOString(), sourceDatabase: db.database, tables };
  atomicJson(join(out, 'manifest.json'), manifest); // Complete marker: written only after all chunks succeed.
  console.log(`Backup complete: ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
