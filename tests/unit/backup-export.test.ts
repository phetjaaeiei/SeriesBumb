import { describe, expect, it } from 'vitest';
import { exportArgs, insertCounts, tablesToExport } from '../../scripts/lib/backup-export';

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
});
