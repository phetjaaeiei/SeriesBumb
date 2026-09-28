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

export function insertCounts(dump: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const match of dump.matchAll(/^INSERT INTO "?([A-Za-z0-9_]+)"?/gmu)) counts[match[1]] = (counts[match[1]] ?? 0) + 1;
  return counts;
}
