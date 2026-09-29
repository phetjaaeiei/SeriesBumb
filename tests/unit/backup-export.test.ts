import { describe, expect, it } from 'vitest';
import { exportArgs, insertCounts, isInsideDirectory, lossyTextQuery, tablesToExport } from '../../scripts/lib/backup-export';

describe('nightly D1 export helpers', () => {
  it('exports ordinary data tables only', () => {
    const all = ['_cf_METADATA', 'account', 'd1_migrations', 'search_doc', 'search_fts', 'search_fts_data', 'search_queue', 'session', 'sqlite_sequence', 'tape', 'user', 'verification'];
    // Sessions/verification never leave Cloudflare; search tables are rebuilt after restore; migrations are re-applied.
    expect(tablesToExport(all)).toEqual(['account', 'tape', 'user']);
  });

  it('builds a data-only, per-table wrangler export', () => {
    expect(exportArgs('seriesbumb', 'remote', ['tape', 'user'], '/tmp/x.sql')).toEqual(['d1', 'export', 'seriesbumb', '--remote', '--no-schema', '--table', 'tape', '--table', 'user', '--output', '/tmp/x.sql']);
  });

  it('counts inserted rows per table from the dump', () => {
    const dump = 'PRAGMA defer_foreign_keys=TRUE;\nINSERT INTO "tape" ("id") VALUES(\'a\');\nINSERT INTO "tape" ("id") VALUES(\'b\');\nINSERT INTO user VALUES(1);\n';
    expect(insertCounts(dump)).toEqual({ tape: 2, user: 1 });
  });

  it('ignores INSERT look-alikes after U+2028/U+2029 inside member text', () => {
    const dump = `INSERT INTO "comment" ("body") VALUES('nice\u2028INSERT INTO "session" x');\nINSERT INTO "user" VALUES(1);\nINSERT INTO "comment" ("body") VALUES('a\u2029INSERT INTO "user" y');\n`;
    expect(insertCounts(dump)).toEqual({ comment: 2, user: 1 });
  });

  it('finds text that D1 export would corrupt (a real newline plus a literal backslash-n or -r)', () => {
    expect(lossyTextQuery('comment', ['body', 'note'])).toBe(
      `SELECT rowid AS rowid FROM "comment" WHERE (instr("body", char(10)) > 0 AND instr("body", '\\n') > 0) OR (instr("body", char(13)) > 0 AND instr("body", '\\r') > 0) OR (instr("note", char(10)) > 0 AND instr("note", '\\n') > 0) OR (instr("note", char(13)) > 0 AND instr("note", '\\r') > 0) LIMIT 50`,
    );
  });

  it('knows when an output folder sits inside the repository', () => {
    expect(isInsideDirectory('/repo', '/repo/backups')).toBe(true);
    expect(isInsideDirectory('/repo', '/repo')).toBe(true);
    expect(isInsideDirectory('/repo', '/home/me/SeriesBumb-backups')).toBe(false);
    expect(isInsideDirectory('/repo', '/repository-other')).toBe(false);
  });
});
