import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Bookmark-first deploy: record a D1 Time Travel bookmark, apply migrations, deploy, smoke-check.
// Run only from a clean worktree so the deployed build matches a commit.

type Target = 'staging' | 'production';

const TARGETS: Record<Target, { worker: string; database: string; siteUrl: string; envArgs: string[] }> = {
  staging: { worker: 'seriesbumb-staging', database: 'seriesbumb-staging', siteUrl: 'https://seriesbumb-staging.phetjaa.workers.dev', envArgs: ['--env', 'staging'] },
  production: { worker: 'seriesbumb', database: 'seriesbumb', siteUrl: 'https://seriesbumb.phetjaa.workers.dev', envArgs: [] },
};

const target = process.argv[2] as Target;
if (!(target in TARGETS)) {
  console.error('usage: node --experimental-strip-types scripts/deploy.ts <staging|production>');
  process.exit(2);
}
const { worker, database, siteUrl, envArgs } = TARGETS[target];

function run(command: string, args: string[], options: { capture?: boolean; env?: NodeJS.ProcessEnv } = {}): string {
  const result = spawnSync(command, args, {
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    env: options.env ?? process.env,
  });
  if (result.status !== 0) {
    console.error(`✗ ${command} ${args.join(' ')} failed`);
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? '';
}

if (run('git', ['status', '--porcelain'], { capture: true }).trim()) {
  console.error('✗ working tree has uncommitted changes; deploy only from a clean worktree');
  process.exit(1);
}
const commit = run('git', ['rev-parse', 'HEAD'], { capture: true }).trim();

const buildEnv: NodeJS.ProcessEnv = { ...process.env };
if (target === 'staging') buildEnv.CLOUDFLARE_ENV = 'staging';
else delete buildEnv.CLOUDFLARE_ENV;

run('npm', ['run', 'check:migrations']);
run('npm', ['run', 'build'], { env: buildEnv });
const built = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8')) as { name: string };
if (built.name !== worker) {
  console.error(`✗ build targets ${built.name}, expected ${worker}`);
  process.exit(1);
}

const { bookmark } = JSON.parse(run('npx', ['wrangler', 'd1', 'time-travel', 'info', database, '--json', ...envArgs], { capture: true })) as { bookmark?: string };
console.log(`• D1 bookmark before migrate (${database}): ${bookmark ?? 'unknown'}`);
run('npx', ['wrangler', 'd1', 'migrations', 'apply', database, '--remote', ...envArgs]);
run('npx', ['wrangler', 'deploy', '--config', 'dist/server/wrangler.json']);

const response = await fetch(siteUrl, { redirect: 'manual' });
if (response.status !== 200) {
  console.error(`✗ smoke check ${siteUrl} returned ${response.status}`);
  console.error(`  roll back code: npx wrangler rollback --name ${worker}`);
  if (bookmark) console.error(`  roll back data: npx wrangler d1 time-travel restore ${database} --bookmark ${bookmark} ${envArgs.join(' ')}`);
  process.exit(1);
}

const deployedAt = new Date().toISOString();
mkdirSync('.deploys', { recursive: true });
writeFileSync(`.deploys/${target}-${deployedAt.replace(/[:.]/g, '-')}.json`, `${JSON.stringify({ target, commit, bookmark: bookmark ?? null, deployedAt }, null, 2)}\n`);
console.log(`✓ deployed ${commit.slice(0, 7)} to ${siteUrl}`);
