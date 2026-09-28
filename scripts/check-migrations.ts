import { readdirSync, readFileSync } from 'node:fs';
import { checkMigrations } from './lib/migrations.ts';

// 0006_artist_profile.sql was hand-written and applied remotely without a journal entry.
// Renaming it would make wrangler re-run ALTER TABLE ADD COLUMN, so it stays outside the journal.
const ALLOW_UNJOURNALED = ['0006_artist_profile'];

const root = new URL('../migrations/', import.meta.url);
const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', root), 'utf8')) as { entries: { tag: string }[] };
const problems = checkMigrations({
  files: readdirSync(root),
  journalTags: journal.entries.map((entry) => entry.tag),
  allowUnjournaled: ALLOW_UNJOURNALED,
});

if (problems.length) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exit(1);
}
console.log('✓ migrations ตรงกับ journal');
