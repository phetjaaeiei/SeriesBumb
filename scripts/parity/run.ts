// HTML parity harness: renders two versions of the app over the same seeded local D1 and diffs
// every crawled page for a guest, a member and an admin. Local only; never touches remote data.
//
//   npm run parity                       # compare HEAD with origin/main
//   npm run parity -- --base <ref> --max 300 --keep
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { diffName, normalizeHtml, pageLinks, shouldCrawl } from './lib.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const baseRef = option('base', 'origin/main');
const maxPages = Number(option('max', '300'));
const keep = args.includes('--keep');

const root = resolve(import.meta.dirname, '../..');
const work = mkdtempSync(join(process.env.PARITY_TMP ?? tmpdir(), 'seriesbumb-parity-'));
const baseTree = join(work, 'base');
const secret = `parity-local-secret-${Date.now()}`;
const children: ChildProcess[] = [];

const run = (cwd: string, command: string, commandArgs: string[], env: NodeJS.ProcessEnv = {}) =>
  execFileSync(command, commandArgs, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: { ...process.env, CI: 'true', ...env } });

function serve(cwd: string, configPath: string, state: string, port: number, vars: Record<string, string>): string {
  const varArgs = Object.entries(vars).flatMap(([key, value]) => ['--var', `${key}:${value}`]);
  const child = spawn('npx', ['wrangler', 'dev', '--config', configPath, '--persist-to', state, '--port', String(port), '--ip', '127.0.0.1', '--local', ...varArgs], {
    cwd, detached: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, CI: 'true' },
  });
  let stderr = '';
  child.stderr?.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
  child.on('exit', (code) => { if (code && code !== 143) console.error(`wrangler dev on ${port} exited ${code}\n${stderr}`); });
  children.push(child);
  return `http://127.0.0.1:${port}`;
}

async function ready(origin: string) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    try { if ((await fetch(`${origin}/robots.txt`, { redirect: 'manual' })).status < 500) return; } catch { /* not up yet */ }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`${origin} did not start`);
}

function stop() {
  for (const child of children) { try { if (child.pid) process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ } }
  children.length = 0;
}

interface Page { status: number; location: string; type: string; cache: string; robots: string; body: string }

async function load(origin: string, path: string, cookie: string | undefined, other: string): Promise<Page> {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual', headers: cookie ? { cookie } : {} });
  const type = response.headers.get('content-type') ?? '';
  const text = await response.text();
  return {
    status: response.status,
    location: (response.headers.get('location') ?? '').replace(origin, 'ORIGIN'),
    type, cache: response.headers.get('cache-control') ?? '', robots: response.headers.get('x-robots-tag') ?? '',
    body: type.includes('html') || type.includes('json') || type.includes('text') ? normalizeHtml(text, [origin, other]) : `<${text.length} bytes>`,
  };
}

async function main() {
  console.log(`parity: HEAD (${run(root, 'git', ['rev-parse', '--short', 'HEAD']).trim()}) vs ${baseRef} in ${work}`);
  run(root, 'git', ['worktree', 'add', '--detach', baseTree, baseRef]);
  symlinkSync(realpathSync(join(root, 'node_modules')), join(baseTree, 'node_modules'));
  for (const tree of [baseTree, root]) run(tree, 'npm', ['run', 'build']);

  const seedState = join(work, 'state');
  mkdirSync(seedState);
  run(root, 'npx', ['wrangler', 'd1', 'migrations', 'apply', 'seriesbumb', '--local', '--persist-to', seedState]);
  const seeder = serve(join(root, 'scripts/parity'), 'wrangler.seed.jsonc', seedState, 8791, { PARITY_AUTH_SECRET: secret });
  await ready(seeder).catch(async () => { await new Promise((done) => setTimeout(done, 1000)); });
  const seeded = await (await fetch(`${seeder}/seed?size=parity`, { method: 'POST' })).json() as { cookies: Record<string, string>; adminEmail: string };
  stop();
  await new Promise((done) => setTimeout(done, 1500));

  const vars = { BETTER_AUTH_SECRET: secret, GOOGLE_CLIENT_ID: 'parity', GOOGLE_CLIENT_SECRET: 'parity', ADMIN_EMAILS: seeded.adminEmail, SITE_URL: 'http://localhost:4321' };
  cpSync(seedState, join(work, 'state-base'), { recursive: true });
  cpSync(seedState, join(work, 'state-head'), { recursive: true });
  const base = serve(baseTree, 'dist/server/wrangler.json', join(work, 'state-base'), 8792, vars);
  const head = serve(root, 'dist/server/wrangler.json', join(work, 'state-head'), 8793, vars);
  await Promise.all([ready(base), ready(head)]);

  const starts = ['/', '/tapes', '/songs', '/artists', '/labels', '/genres', '/collections', '/decades', '/latest', '/reviews', '/search?q=%E0%B8%A3%E0%B8%B1%E0%B8%81', '/search/advanced', '/search/advanced?q=%E0%B8%9D%E0%B8%99', '/me', '/me/submissions', '/robots.txt', '/no-such-page', '/admin'];
  const viewers: [string, string | undefined][] = [['guest', undefined], ['member', seeded.cookies.member], ['admin', seeded.cookies.admin]];
  const diffDir = join(work, 'diff');
  mkdirSync(diffDir);
  let total = 0;
  let different = 0;
  for (const [viewer, cookie] of viewers) {
    const queue = [...starts];
    const seen = new Set(queue);
    let compared = 0;
    while (queue.length && compared < maxPages) {
      const batch = queue.splice(0, 6);
      await Promise.all(batch.map(async (path) => {
        const [a, b] = await Promise.all([load(base, path, cookie, head), load(head, path, cookie, base)]);
        compared += 1; total += 1;
        const same = a.status === b.status && a.location === b.location && a.type === b.type && a.cache === b.cache && a.robots === b.robots && a.body === b.body;
        if (!same) {
          different += 1;
          const name = diffName(viewer, path, total);
          writeFileSync(join(diffDir, `${name}.base.html`), `${a.status} ${a.location} ${a.type} ${a.cache} ${a.robots}\n${a.body}`);
          writeFileSync(join(diffDir, `${name}.head.html`), `${b.status} ${b.location} ${b.type} ${b.cache} ${b.robots}\n${b.body}`);
          console.log(`DIFF ${viewer} ${path}: ${a.status}→${b.status}${a.body === b.body ? ' (headers only)' : ''}`);
        }
        for (const link of pageLinks(a.body)) if (shouldCrawl(link, viewer) && !seen.has(link)) { seen.add(link); queue.push(link); }
      }));
    }
    console.log(`${viewer}: compared ${compared} pages${queue.length ? ` (stopped at --max ${maxPages}, ${queue.length} queued)` : ''}`);
  }
  console.log(`parity: ${total - different}/${total} identical${different ? `; diffs in ${diffDir}` : ''}`);
  return different;
}

let exitCode = 1;
try { exitCode = (await main()) ? 1 : 0; }
catch (error) { console.error(error instanceof Error ? error.message : error); }
finally {
  stop();
  if (!keep) {
    try { run(root, 'git', ['worktree', 'remove', '--force', baseTree]); } catch { /* already removed */ }
    if (existsSync(join(work, 'diff')) && exitCode) console.log(`kept diffs: ${join(work, 'diff')}`);
    else rmSync(work, { recursive: true, force: true });
  }
}
process.exit(exitCode);

