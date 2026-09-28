import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKUP_EXCLUDED_TABLES, restorableTables } from './lib/backup-redaction.ts';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const format = 'seriesbumb-d1-json-v1';

export interface DbOptions { database: string; local: boolean; persistTo?: string }
export interface DbResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { rows_written?: number };
}
export interface Column { name: string; type: string; notnull: number; pk: number }
export interface TableSchema { name: string; createSql: string; columns: Column[] }
export interface BackupRow { rowid: string; values: Record<string, string | number | null> }
export interface BackupChunk { file: string; count: number; sha256: string }
export interface BackupTable extends TableSchema { count: number; chunks: BackupChunk[] }
export interface Manifest { format: typeof format; createdAt: string; sourceDatabase: string; tables: BackupTable[] }

export function query<T = Record<string, unknown>>(db: DbOptions, sql: string): DbResult<T> {
  const wrangler = join(root, 'node_modules', '.bin', 'wrangler');
  if (!existsSync(wrangler)) throw new Error('Missing node_modules/.bin/wrangler. Run npm install first.');
  const args = ['d1', 'execute', db.database, db.local ? '--local' : '--remote', '--json', '--yes', '--command', sql];
  if (db.persistTo) args.push('--persist-to', db.persistTo);
  const child = spawnSync(wrangler, args, { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Wrangler failed: ${(child.stderr || child.stdout).trim()}`);
  let parsed: DbResult<T>[];
  try { parsed = JSON.parse(child.stdout) as DbResult<T>[]; }
  catch { throw new Error(`Wrangler did not return JSON: ${child.stdout.slice(0, 500)}`); }
  if (!Array.isArray(parsed) || parsed.length !== 1 || !parsed[0]?.success || !Array.isArray(parsed[0].results)) {
    throw new Error(`Unexpected Wrangler result: ${child.stdout.slice(0, 500)}`);
  }
  return parsed[0];
}

export function identifier(name: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(name)) throw new Error(`Unsupported SQL identifier: ${name}`);
  return `"${name}"`;
}

export function literal(value: string | number | null): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
      throw new Error('Backup contains a number that JSON cannot represent safely.');
    }
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

export function hash(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

export function atomicJson(path: string, value: unknown): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  renameSync(tmp, path);
}

export function tableSchemas(db: DbOptions): TableSchema[] {
  const all = query<{ name: string; sql: string | null }>(db, "SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name").results;
  const ftsRoots = all.filter(row => /^CREATE VIRTUAL TABLE\b/i.test(row.sql ?? '') && /\bUSING\s+fts5\b/i.test(row.sql ?? '')).map(row => row.name);
  const tables = all.filter(row => {
    if (/^(sqlite_|_cf_)/i.test(row.name) || row.name === 'd1_migrations' || BACKUP_EXCLUDED_TABLES.includes(row.name)) return false;
    if (ftsRoots.some(rootName => row.name === rootName || row.name.startsWith(`${rootName}_`))) return false;
    if (/^CREATE VIRTUAL TABLE\b/i.test(row.sql ?? '')) throw new Error(`Unsupported virtual table: ${row.name}`);
    return true;
  });
  return tables.map(row => {
    identifier(row.name);
    if (!row.sql) throw new Error(`Missing CREATE SQL for ${row.name}`);
    const columns = query<Column>(db, `PRAGMA table_info(${identifier(row.name)})`).results.map(col => ({
      name: col.name, type: col.type, notnull: col.notnull, pk: col.pk,
    }));
    if (!columns.length || columns.some(col => col.name === '__backup_rowid__')) throw new Error(`Unsupported columns in ${row.name}`);
    columns.forEach(col => identifier(col.name));
    return { name: row.name, createSql: row.sql, columns };
  });
}

export function readManifest(directory: string): Manifest {
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')) as Manifest;
  if (manifest.format !== format || !Array.isArray(manifest.tables) || !manifest.tables.length) {
    throw new Error('Invalid or incomplete SeriesBumb backup manifest.');
  }
  return { ...manifest, tables: restorableTables(manifest.tables) };
}

export function sameSchema(a: TableSchema[], b: TableSchema[]): boolean {
  const normalize = (tables: TableSchema[]) => tables.map(table => ({
    name: table.name,
    createSql: table.createSql.replace(/\s+/g, ' ').trim(),
    columns: table.columns,
  }));
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
