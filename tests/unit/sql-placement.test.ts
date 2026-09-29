import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// SQL lives in src/repositories/ only. Everything else asks a repository for rows or statements and,
// for a write that spans aggregates, commits them with runBatch (src/repositories/batch.repo.ts).
// src/db/ is the D1 seam itself; src/auth/auth.ts keeps better-auth's drizzle adapter and its hooks.
const root = process.cwd();
const allowed = [/^src\/repositories\//u, /^src\/db\//u, /^src\/auth\/auth\.ts$/u];
const sqlCall = /\.(?:prepare|batch)\(/u;

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
    .map((file) => `${dir}/${file.split(sep).join('/')}`)
    .filter((file) => /\.(?:ts|tsx|astro)$/u.test(file));
}

describe('SQL placement', () => {
  it('finds the source tree', () => {
    const files = sourceFiles('src');
    expect(files).toContain('src/repositories/tapes.repo.ts');
    expect(files.some((file) => file.startsWith('src/pages/') && file.endsWith('.astro'))).toBe(true);
  });

  it('keeps .prepare( and .batch( inside src/repositories/, src/db/ and src/auth/auth.ts', () => {
    const offenders = sourceFiles('src')
      .filter((file) => !allowed.some((pattern) => pattern.test(file)))
      .filter((file) => sqlCall.test(readFileSync(join(root, file), 'utf8')));
    expect(offenders, `SQL outside src/repositories/ (move it into a <aggregate>.repo.ts function):\n${offenders.join('\n')}`).toEqual([]);
  });
});
