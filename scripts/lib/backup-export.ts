// Pure helpers for scripts/backup-export.ts (tests/unit/backup-export.test.ts).
import { BACKUP_EXCLUDED_TABLES } from './backup-redaction.ts';

/**
 * Ordinary tables worth restoring. Sessions and verification never leave Cloudflare, search tables
 * (FTS5 cannot be exported and the rest is derived) are rebuilt from the admin page after a restore,
 * and d1_migrations is recreated by applying migrations to the new database first.
 */
export function tablesToExport(names: string[]): string[] {
  return names
    .filter((name) => !/^(sqlite_|_cf_|search_)/iu.test(name) && name !== 'd1_migrations' && !BACKUP_EXCLUDED_TABLES.includes(name))
    .sort();
}

export function exportArgs(database: string, where: 'remote' | 'local', tables: string[], output: string): string[] {
  return ['d1', 'export', database, `--${where}`, '--no-schema', ...tables.flatMap((table) => ['--table', table]), '--output', output];
}

/**
 * Rows per table. Only real line starts count: wrangler joins statements with \n and escapes \n/\r
 * inside values, but U+2028/U+2029 stay raw, and a regex with the m flag would treat them as lines.
 */
export function insertCounts(dump: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const line of dump.split('\n')) {
    const match = /^INSERT INTO "?([A-Za-z0-9_]+)"?/u.exec(line);
    if (match) counts[match[1]] = (counts[match[1]] ?? 0) + 1;
  }
  return counts;
}

const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

/**
 * Rows whose text D1 export cannot round-trip: it writes a real newline as \n inside
 * replace(..., '\n', char(10)), so a literal backslash-n in the same value also becomes a newline.
 */
export function lossyTextQuery(table: string, textColumns: string[]): string {
  const checks = textColumns.flatMap((column) => [
    `(instr(${quoteIdentifier(column)}, char(10)) > 0 AND instr(${quoteIdentifier(column)}, '\\n') > 0)`,
    `(instr(${quoteIdentifier(column)}, char(13)) > 0 AND instr(${quoteIdentifier(column)}, '\\r') > 0)`,
  ]);
  return `SELECT rowid AS rowid FROM ${quoteIdentifier(table)} WHERE ${checks.join(' OR ')} LIMIT 50`;
}

export function isInsideDirectory(root: string, target: string): boolean {
  const base = root.replace(/\/+$/u, '');
  return target === base || target.startsWith(`${base}/`);
}
