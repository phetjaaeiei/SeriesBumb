// One-off codemod for Phase 3a: moves modules into layered directories and rewrites every relative import.
// Usage: node --experimental-strip-types scripts/move-modules.ts [--dry-run]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { rewriteImports } from './lib/rewrite-imports.ts';

const root = resolve(import.meta.dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

const MOVES: [string, string][] = [
  ...['thai', 'slug', 'search', 'format', 'urls', 'provinces', 'song-notes', 'types', 'admin-session', 'admin-emails'].map((name): [string, string] => [`src/lib/${name}.ts`, `src/domain/${name}.ts`]),
  ['src/lib/queries/cursor.ts', 'src/domain/cursor.ts'],
  ...['auth', 'auth-routes', 'permissions', 'access-jwt'].map((name): [string, string] => [`src/lib/${name}.ts`, `src/auth/${name}.ts`]),
  ['src/lib/http-headers.ts', 'src/http/headers.ts'],
  ...['robots', 'rate-limit', 'turnstile', 'admin-surface'].map((name): [string, string] => [`src/lib/${name}.ts`, `src/http/${name}.ts`]),
  ['src/lib/services/audio-http.ts', 'src/http/audio-http.ts'],
  ...['image-store', 'supabase-image-store', 'firebase-image-store', 'audio-store'].map((name): [string, string] => [`src/lib/services/${name}.ts`, `src/storage/${name}.ts`]),
  ['src/lib/errors.ts', 'src/errors/d1.ts'],
  ['src/lib/actions.ts', 'src/actions/define.ts'],
  ['src/lib/schemas.ts', 'src/actions/schemas.ts'],
];

const tracked = git('ls-files', 'src', 'tests', 'scripts', 'astro.config.mjs').split('\n').filter(Boolean);
for (const file of tracked) {
  if (file.startsWith('src/lib/middleware/')) MOVES.push([file, file.replace('src/lib/middleware/', 'src/http/middleware/')]);
  else if (file.startsWith('src/lib/client/')) MOVES.push([file, file.replace('src/lib/client/', 'src/client/')]);
  else if (file.startsWith('src/lib/queries/') && !MOVES.some(([from]) => from === file)) MOVES.push([file, file.replace('src/lib/queries/', 'src/repositories/').replace(/\.ts$/u, '.repo.ts')]);
  else if (file.startsWith('src/lib/services/') && !MOVES.some(([from]) => from === file)) MOVES.push([file, file.replace('src/lib/services/', 'src/services/')]);
}

const moved = new Map(MOVES.map(([from, to]) => [resolve(root, from), resolve(root, to)]));
for (const [from, to] of MOVES) {
  if (!existsSync(resolve(root, from))) throw new Error(`Missing ${from}`);
  if (existsSync(resolve(root, to))) throw new Error(`Target exists ${to}`);
}

const SOURCE = /\.(ts|tsx|astro|mjs|js)$/u;
const CODEMOD = new Set(['scripts/move-modules.ts', 'scripts/lib/rewrite-imports.ts', 'tests/unit/rewrite-imports.test.ts']);
const rewritten = new Map<string, string>();
for (const file of tracked.filter((path) => SOURCE.test(path) && !CODEMOD.has(path))) {
  const oldPath = resolve(root, file);
  const newPath = moved.get(oldPath) ?? oldPath;
  const before = readFileSync(oldPath, 'utf8');
  const after = rewriteImports(before, oldPath, newPath, moved, existsSync);
  if (after !== before) rewritten.set(newPath, after);
}

console.log(`${MOVES.length} moves, ${rewritten.size} files with rewritten imports`);
if (dryRun) process.exit(0);
for (const [from, to] of MOVES) {
  mkdirSync(dirname(resolve(root, to)), { recursive: true });
  git('mv', from, to);
}
for (const [path, contents] of rewritten) writeFileSync(path, contents);
