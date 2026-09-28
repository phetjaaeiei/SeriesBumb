# Free Demo Phase 0: Safety Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give SeriesBumb a CI gate, a migration consistency check, a typed config module, a staging environment, scripted deploys, and E2E smoke tests — without changing user-visible behavior in production.

**Architecture:** Add `src/config/` (zod-validated env → typed `AppConfig`), wire it into auth and environment-aware headers/robots. Add `env.staging` to `wrangler.jsonc` with its own Worker and D1. `scripts/deploy.ts` records a D1 Time Travel bookmark, applies migrations, deploys and smoke-checks. GitHub Actions runs the same checks on every PR.

**Tech Stack:** Astro 7.3.5 SSR, @astrojs/cloudflare 14.3.3, wrangler 4.140, Cloudflare D1, better-auth 1.7.6, astro/zod (zod 4), Vitest 4.1, @cloudflare/vitest-plugin 1.2.7, Playwright 1.63, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-28-seriesbumb-free-production-ready-design.md` (sections 4, 5, 11)

## Global Constraints

- Monthly cost stays $0; no service that needs a card.
- Do not rename or edit applied migrations; `0006_artist_profile.sql` is a known hand-written file outside the journal and stays.
- Secrets only via `wrangler secret put`; never in `vars`, never printed to logs.
- Production URL stays `https://seriesbumb.phetjaa.workers.dev`; staging is `https://seriesbumb-staging.phetjaa.workers.dev`.
- Do not enable branch protection on `main`.
- UI copy is Thai.
- Every behavior change starts with a failing test.

## File Map

| File | Responsibility |
| --- | --- |
| `scripts/lib/migrations.ts` (new) | Pure check: migration `.sql` files vs `migrations/meta/_journal.json` |
| `scripts/check-migrations.ts` (new) | CLI wrapper, exits 1 on problems |
| `tests/unit/check-migrations.test.ts` (new) | Unit tests for the pure check |
| `src/config/env.schema.ts` (new) | zod schema of raw Worker env |
| `src/config/config.ts` (new) | `getConfig(env)` → memoized `AppConfig`, `ConfigError` |
| `tests/unit/config.test.ts` (new) | Config parsing tests |
| `src/lib/auth.ts` (modify) | `getAuth()` reads credentials from `getConfig` |
| `src/lib/middleware/security-headers.ts` (modify) | `X-Robots-Tag: noindex` on non-production |
| `src/pages/robots.txt.ts` (modify) | Disallow everything on non-production |
| `wrangler.jsonc` (modify) | `APP_ENV` var, `env.staging` |
| `astro.config.mjs` (modify) | CSP origins follow `CLOUDFLARE_ENV` vars |
| `scripts/deploy.ts` (new) | bookmark → migrate → deploy → smoke check |
| `package.json` (modify) | `check:migrations`, `deploy:staging`, `deploy:prod`, `test:e2e` |
| `.github/workflows/ci.yml`, `.github/dependabot.yml` (new) | CI gate, dependency updates |
| `playwright.config.ts`, `tests/e2e/smoke.spec.ts` (new/modify) | Smoke tests against any base URL |
| `CLAUDE.md` (new), `README.md` (modify), `.gitignore` (modify) | Repo rules, accurate stack docs |

---

### Task 1: Migration consistency check

**Files:**
- Create: `scripts/lib/migrations.ts`, `scripts/check-migrations.ts`, `tests/unit/check-migrations.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `checkMigrations(input: { files: string[]; journalTags: string[]; allowUnjournaled: string[] }): string[]` (returns human-readable problems, empty when consistent); npm script `check:migrations`.

- [ ] **Step 1: Write the failing test** — `tests/unit/check-migrations.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { checkMigrations } from '../../scripts/lib/migrations';

describe('checkMigrations', () => {
  const allowUnjournaled = ['0006_artist_profile'];

  it('accepts files that match the journal plus the allowlisted hand-written file', () => {
    expect(checkMigrations({
      files: ['0000_a.sql', '0001_b.sql', '0006_artist_profile.sql'],
      journalTags: ['0000_a', '0001_b'],
      allowUnjournaled,
    })).toEqual([]);
  });

  it('reports a sql file missing from the journal', () => {
    expect(checkMigrations({ files: ['0000_a.sql', '0001_x.sql'], journalTags: ['0000_a'], allowUnjournaled }))
      .toEqual(['0001_x.sql ไม่อยู่ใน migrations/meta/_journal.json (สร้างด้วย npm run db:generate เท่านั้น)']);
  });

  it('reports a journal entry without a file', () => {
    expect(checkMigrations({ files: ['0000_a.sql'], journalTags: ['0000_a', '0001_b'], allowUnjournaled }))
      .toEqual(['journal อ้าง 0001_b แต่ไม่มีไฟล์ 0001_b.sql']);
  });

  it('reports a duplicated numeric prefix among journaled files', () => {
    expect(checkMigrations({ files: ['0007_a.sql', '0007_b.sql'], journalTags: ['0007_a', '0007_b'], allowUnjournaled }))
      .toEqual(['เลข migration 0007 ซ้ำกัน: 0007_a.sql, 0007_b.sql']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --config vitest.config.ts tests/unit/check-migrations.test.ts`
Expected: FAIL — cannot resolve `../../scripts/lib/migrations`.

- [ ] **Step 3: Implement** — `scripts/lib/migrations.ts`

```ts
export interface MigrationCheckInput {
  files: string[];
  journalTags: string[];
  allowUnjournaled: string[];
}

export function checkMigrations({ files, journalTags, allowUnjournaled }: MigrationCheckInput): string[] {
  const problems: string[] = [];
  const sqlFiles = files.filter((file) => file.endsWith('.sql')).sort();
  const tags = new Set(journalTags);
  const allowed = new Set(allowUnjournaled);
  const fileTags = new Set(sqlFiles.map((file) => file.slice(0, -4)));

  for (const file of sqlFiles) {
    const tag = file.slice(0, -4);
    if (!tags.has(tag) && !allowed.has(tag)) problems.push(`${file} ไม่อยู่ใน migrations/meta/_journal.json (สร้างด้วย npm run db:generate เท่านั้น)`);
  }
  for (const tag of journalTags) {
    if (!fileTags.has(tag)) problems.push(`journal อ้าง ${tag} แต่ไม่มีไฟล์ ${tag}.sql`);
  }
  const byPrefix = new Map<string, string[]>();
  for (const file of sqlFiles) {
    if (allowed.has(file.slice(0, -4))) continue;
    const prefix = file.split('_')[0];
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), file]);
  }
  for (const [prefix, group] of byPrefix) {
    if (group.length > 1) problems.push(`เลข migration ${prefix} ซ้ำกัน: ${group.join(', ')}`);
  }
  return problems;
}
```

`scripts/check-migrations.ts`

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { checkMigrations } from './lib/migrations.ts';

// 0006_artist_profile.sql was hand-written and applied remotely before the journal existed for it.
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
```

Add to `package.json` scripts: `"check:migrations": "node --experimental-strip-types scripts/check-migrations.ts"`.

- [ ] **Step 4: Run tests and the CLI**

Run: `npx vitest run --config vitest.config.ts tests/unit/check-migrations.test.ts && npm run check:migrations`
Expected: 4 tests PASS, then `✓ migrations ตรงกับ journal`.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/migrations.ts scripts/check-migrations.ts tests/unit/check-migrations.test.ts package.json
git commit -m "chore(migrations): check sql files against the drizzle journal"
```

---

### Task 2: Typed config module

**Files:**
- Create: `src/config/env.schema.ts`, `src/config/config.ts`, `tests/unit/config.test.ts`
- Modify: `src/lib/auth.ts:80-86`, `src/lib/middleware/security-headers.ts`, `src/pages/robots.txt.ts`, `wrangler.jsonc` (add `"APP_ENV": "production"` to `vars`), `.dev.vars.example` (add `APP_ENV="development"`), `vitest.integration.config.ts` (add `APP_ENV: 'development'`), `tests/unit/stubs/cloudflare-workers.ts` (add `APP_ENV: 'development'`)
- Test: `tests/unit/config.test.ts`, existing `tests/integration/auth.test.ts`

**Interfaces:**
- Produces:
  - `type AppEnv = 'production' | 'staging' | 'development'`
  - `interface AppConfig { appEnv: AppEnv; siteUrl: string; siteOrigin: string; auth: { secret: string; googleClientId: string; googleClientSecret: string; adminEmails: Set<string> }; images: { baseUrl: string | null; uploadsEnabled: boolean; supabase: SupabaseTarget | null }; audio: { supabase: SupabaseTarget | null; firebaseEnabled: boolean }; analytics: { beaconToken: string | null } }`
  - `interface SupabaseTarget { url: string; secretKey: string; bucket: string }`
  - `getConfig(env: Record<string, unknown>): AppConfig` (memoized per env object)
  - `class ConfigError extends Error { issues: string[] }` — lists invalid keys only, never values
  - `isProduction(config: AppConfig): boolean`

- [ ] **Step 1: Write the failing test** — `tests/unit/config.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { ConfigError, getConfig, isProduction } from '../../src/config/config';

const base = {
  SITE_URL: 'https://seriesbumb.phetjaa.workers.dev',
  BETTER_AUTH_SECRET: 'x'.repeat(40),
  GOOGLE_CLIENT_ID: 'client',
  GOOGLE_CLIENT_SECRET: 'secret',
};

describe('getConfig', () => {
  it('parses the minimal production env with safe defaults', () => {
    const config = getConfig({ ...base });
    expect(config.appEnv).toBe('production');
    expect(config.siteOrigin).toBe('https://seriesbumb.phetjaa.workers.dev');
    expect(config.images).toEqual({ baseUrl: null, uploadsEnabled: false, supabase: null });
    expect(config.audio).toEqual({ supabase: null, firebaseEnabled: false });
    expect(isProduction(config)).toBe(true);
  });

  it('turns string flags and admin emails into typed values', () => {
    const config = getConfig({ ...base, ADMIN_EMAILS: ' A@x.com, b@x.com ,', SUPABASE_IMAGE_UPLOADS_ENABLED: 'true' });
    expect([...config.auth.adminEmails]).toEqual(['a@x.com', 'b@x.com']);
    expect(config.images.uploadsEnabled).toBe(true);
  });

  it('builds separate supabase targets that default to SUPABASE_URL', () => {
    const config = getConfig({
      ...base,
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SECRET_KEY: 'sb_secret_x',
      SUPABASE_IMAGE_BUCKET: 'Images',
      SUPABASE_AUDIO_BUCKET: 'Audio',
      SUPABASE_AUDIO_URL: 'https://def.supabase.co',
    });
    expect(config.images.supabase).toEqual({ url: 'https://abc.supabase.co', secretKey: 'sb_secret_x', bucket: 'Images' });
    expect(config.audio.supabase).toEqual({ url: 'https://def.supabase.co', secretKey: 'sb_secret_x', bucket: 'Audio' });
  });

  it('rejects an insecure public SITE_URL and lists only key names', () => {
    let error: unknown;
    try { getConfig({ ...base, SITE_URL: 'http://example.com', GOOGLE_CLIENT_SECRET: '' }); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).issues).toEqual(['GOOGLE_CLIENT_SECRET', 'SITE_URL']);
    expect((error as Error).message).not.toContain('example.com');
  });

  it('allows http for localhost development', () => {
    expect(getConfig({ ...base, SITE_URL: 'http://localhost:4321', APP_ENV: 'development' }).siteOrigin).toBe('http://localhost:4321');
  });

  it('memoizes per env object', () => {
    const env = { ...base };
    expect(getConfig(env)).toBe(getConfig(env));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --config vitest.config.ts tests/unit/config.test.ts`
Expected: FAIL — cannot resolve `../../src/config/config`.

- [ ] **Step 3: Implement** — `src/config/env.schema.ts`

```ts
import { z } from 'astro/zod';

const optionalText = z.string().trim().min(1).optional().catch(undefined);
const flag = z.enum(['true', 'false']).optional().transform((value) => value === 'true');
const optionalHttpsUrl = z.url({ protocol: /^https$/ }).optional();

const siteUrl = z.url({ protocol: /^https?$/ }).refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}, 'SITE_URL must be https outside localhost');

export const envSchema = z.object({
  APP_ENV: z.enum(['production', 'staging', 'development']).default('production'),
  SITE_URL: siteUrl,
  BETTER_AUTH_SECRET: z.string().min(16),
  GOOGLE_CLIENT_ID: z.string().trim().min(1),
  GOOGLE_CLIENT_SECRET: z.string().trim().min(1),
  ADMIN_EMAILS: z.string().optional(),
  IMAGE_BASE_URL: optionalHttpsUrl,
  SUPABASE_URL: optionalHttpsUrl,
  SUPABASE_IMAGE_URL: optionalHttpsUrl,
  SUPABASE_AUDIO_URL: optionalHttpsUrl,
  SUPABASE_SECRET_KEY: optionalText,
  SUPABASE_IMAGE_BUCKET: optionalText,
  SUPABASE_AUDIO_BUCKET: optionalText,
  SUPABASE_IMAGE_UPLOADS_ENABLED: flag,
  AUDIO_FIREBASE_ENABLED: flag,
  SUPABASE_IMAGE_SECRET_KEY: optionalText,
  SUPABASE_AUDIO_SECRET_KEY: optionalText,
  CF_BEACON_TOKEN: optionalText,
});

export type RawEnv = z.input<typeof envSchema>;
export type ParsedEnv = z.output<typeof envSchema>;
```

`src/config/config.ts`

```ts
import { parseAdminEmails } from '../lib/admin-emails';
import { envSchema, type ParsedEnv } from './env.schema';

export type AppEnv = ParsedEnv['APP_ENV'];

export interface SupabaseTarget { url: string; secretKey: string; bucket: string }

export interface AppConfig {
  appEnv: AppEnv;
  siteUrl: string;
  siteOrigin: string;
  auth: { secret: string; googleClientId: string; googleClientSecret: string; adminEmails: Set<string> };
  images: { baseUrl: string | null; uploadsEnabled: boolean; supabase: SupabaseTarget | null };
  audio: { supabase: SupabaseTarget | null; firebaseEnabled: boolean };
  analytics: { beaconToken: string | null };
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid Worker configuration: ${issues.join(', ')}`);
    this.name = 'ConfigError';
  }
}

const cache = new WeakMap<object, AppConfig>();

function supabaseTarget(url: string | undefined, secretKey: string | undefined, bucket: string | undefined): SupabaseTarget | null {
  return url && secretKey && bucket ? { url, secretKey, bucket } : null;
}

export function getConfig(env: Record<string, unknown>): AppConfig {
  const cached = cache.get(env);
  if (cached) return cached;
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'env')))].sort();
    throw new ConfigError(issues);
  }
  const e = parsed.data;
  const site = new URL(e.SITE_URL);
  const config: AppConfig = {
    appEnv: e.APP_ENV,
    siteUrl: site.origin,
    siteOrigin: site.origin,
    auth: {
      secret: e.BETTER_AUTH_SECRET,
      googleClientId: e.GOOGLE_CLIENT_ID,
      googleClientSecret: e.GOOGLE_CLIENT_SECRET,
      adminEmails: parseAdminEmails(e.ADMIN_EMAILS),
    },
    images: {
      baseUrl: e.IMAGE_BASE_URL ?? null,
      uploadsEnabled: e.SUPABASE_IMAGE_UPLOADS_ENABLED,
      supabase: supabaseTarget(e.SUPABASE_IMAGE_URL ?? e.SUPABASE_URL, e.SUPABASE_IMAGE_SECRET_KEY ?? e.SUPABASE_SECRET_KEY, e.SUPABASE_IMAGE_BUCKET),
    },
    audio: {
      supabase: supabaseTarget(e.SUPABASE_AUDIO_URL ?? e.SUPABASE_URL, e.SUPABASE_AUDIO_SECRET_KEY ?? e.SUPABASE_SECRET_KEY, e.SUPABASE_AUDIO_BUCKET),
      firebaseEnabled: e.AUDIO_FIREBASE_ENABLED,
    },
    analytics: { beaconToken: e.CF_BEACON_TOKEN ?? null },
  };
  cache.set(env, config);
  return config;
}

export function isProduction(config: AppConfig): boolean {
  return config.appEnv === 'production';
}
```

Wire into `src/lib/auth.ts` (replace `getAuth`):

```ts
import { getConfig } from '../config/config';

export function getAuth(): Auth {
  if (!cachedAuth) {
    const config = getConfig(env);
    cachedAuth = createAuth(env.DB, {
      SITE_URL: config.siteUrl,
      BETTER_AUTH_SECRET: config.auth.secret,
      GOOGLE_CLIENT_ID: config.auth.googleClientId,
      GOOGLE_CLIENT_SECRET: config.auth.googleClientSecret,
      ADMIN_EMAILS: [...config.auth.adminEmails].join(','),
    });
  }
  return cachedAuth;
}
```

`src/lib/middleware/security-headers.ts`: import `env` from `cloudflare:workers` and `getConfig`, `isProduction`; after the admin block add:

```ts
  if (!isProduction(getConfig(env))) headers.set('X-Robots-Tag', 'noindex, nofollow');
```

`src/pages/robots.txt.ts`: when `!isProduction(getConfig(env))` return `User-agent: *\nDisallow: /\n` with the same headers as the production body.

- [ ] **Step 4: Run the new tests, then the full suites**

Run: `npx vitest run --config vitest.config.ts tests/unit/config.test.ts && npm test && npm run test:int && npm run check`
Expected: config tests PASS (6), unit 112+ PASS, integration 65 PASS, `astro check` 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/config tests/unit/config.test.ts src/lib/auth.ts src/lib/middleware/security-headers.ts src/pages/robots.txt.ts wrangler.jsonc .dev.vars.example vitest.integration.config.ts tests/unit/stubs/cloudflare-workers.ts
git commit -m "feat(config): validate Worker env once and mark non-production noindex"
```

---

### Task 3: CI workflow and Dependabot

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/dependabot.yml`

**Interfaces:**
- Consumes: npm scripts `check:migrations`, `lint`, `check`, `test`, `test:int`, `build`.

- [ ] **Step 1: Resolve pinned action SHAs**

Run:
```bash
for r in actions/checkout@v5 actions/setup-node@v5 gitleaks/gitleaks-action@v2; do repo=${r%@*}; tag=${r#*@}; echo "$r $(gh api repos/$repo/commits/$tag --jq .sha)"; done
```
Expected: three lines `owner/repo@tag <40-char sha>`. Use them below as `<CHECKOUT_SHA>`, `<SETUP_NODE_SHA>`, `<GITLEAKS_SHA>`.

- [ ] **Step 2: Write** `.github/workflows/ci.yml`

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@<CHECKOUT_SHA> # v5
      - uses: actions/setup-node@<SETUP_NODE_SHA> # v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check:migrations
      - run: npm run lint
      - run: npm run check
      - run: npm test
      - run: npm run test:int
      - run: npm run build
      - run: npm audit --omit=dev --audit-level=high
  secret-scan:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@<CHECKOUT_SHA> # v5
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@<GITLEAKS_SHA> # v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`.github/dependabot.yml`

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      astro:
        patterns: ['astro', '@astrojs/*']
      cloudflare:
        patterns: ['wrangler', '@cloudflare/*']
      auth-db:
        patterns: ['better-auth', '@better-auth/*', 'drizzle-*']
      dev-tools:
        dependency-type: development
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

- [ ] **Step 3: Validate locally**

Run: `node -e "for (const f of ['.github/workflows/ci.yml','.github/dependabot.yml']) require('yaml').parse(require('fs').readFileSync(f,'utf8'))" && npm run build`
Expected: no output from YAML parse (yaml is a transitive dependency; if missing, use `npx --yes yaml valid < file`), build succeeds.

- [ ] **Step 4: Commit**

```bash
git add .github
git commit -m "ci: verify migrations, lint, types, tests, build and secrets on every PR"
```

---

### Task 4: Staging environment and scripted deploys

**Files:**
- Modify: `wrangler.jsonc`, `astro.config.mjs:7`, `package.json`, `.gitignore`
- Create: `scripts/deploy.ts`

**Interfaces:**
- Produces: `npm run deploy:staging`, `npm run deploy:prod`; deploy records in `.deploys/<env>-<iso>.json` (gitignored).

- [ ] **Step 1: Create the staging D1 database**

Run: `npx wrangler d1 create seriesbumb-staging --location apac`
Expected: prints a `database_id` UUID. Use it as `<STAGING_DB_ID>`.

- [ ] **Step 2: Add `env.staging` to `wrangler.jsonc`** (after `observability`)

```jsonc
  "env": {
    "staging": {
      "name": "seriesbumb-staging",
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "seriesbumb-staging",
          "database_id": "<STAGING_DB_ID>",
          "migrations_dir": "migrations"
        }
      ],
      "vars": {
        "APP_ENV": "staging",
        "SITE_URL": "https://seriesbumb-staging.phetjaa.workers.dev",
        "FIREBASE_STORAGE_BUCKET": "seriesbumb-32f9e.firebasestorage.app",
        "SUPABASE_URL": "https://lgtdhbeocizxxvptofdb.supabase.co",
        "SUPABASE_AUDIO_BUCKET": "SeriesBumb",
        "SUPABASE_IMAGE_BUCKET": "SeriesBumbImages",
        "SUPABASE_IMAGE_UPLOADS_ENABLED": "false",
        "AUDIO_FIREBASE_ENABLED": "false",
        "FIREBASE_IMAGE_UPLOADS_ENABLED": "false",
        "IMAGE_BASE_URL": "https://lgtdhbeocizxxvptofdb.supabase.co/storage/v1/object/public/SeriesBumbImages",
        "CF_BEACON_TOKEN": ""
      },
      "observability": { "enabled": true }
    }
  }
```

- [ ] **Step 3: Make CSP origins follow the selected env** — in `astro.config.mjs` replace the `workerVars` line with:

```js
const wranglerConfig = JSON.parse(readFileSync(new URL('./wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gmu, ''));
const selectedEnv = process.env.CLOUDFLARE_ENV;
const workerVars = { ...(wranglerConfig.vars ?? {}), ...(selectedEnv ? wranglerConfig.env?.[selectedEnv]?.vars ?? {} : {}) };
```

- [ ] **Step 4: Verify the staging build output**

Run: `CLOUDFLARE_ENV=staging npm run build && node -e "const c=require('./dist/server/wrangler.json');console.log(c.name,c.d1_databases[0].database_name,c.vars.APP_ENV)"`
Expected: `seriesbumb-staging seriesbumb-staging staging`. Then `npm run build` and the same command prints `seriesbumb seriesbumb production`.

- [ ] **Step 5: Write** `scripts/deploy.ts`

```ts
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

type Target = 'staging' | 'production';
const target = process.argv[2] as Target;
if (target !== 'staging' && target !== 'production') {
  console.error('usage: node --experimental-strip-types scripts/deploy.ts <staging|production>');
  process.exit(2);
}

const database = target === 'staging' ? 'seriesbumb-staging' : 'seriesbumb';
const siteUrl = target === 'staging' ? 'https://seriesbumb-staging.phetjaa.workers.dev' : 'https://seriesbumb.phetjaa.workers.dev';
const envArgs = target === 'staging' ? ['--env', 'staging'] : [];
const buildEnv = { ...process.env, ...(target === 'staging' ? { CLOUDFLARE_ENV: 'staging' } : {}) };
if (target === 'production') delete buildEnv.CLOUDFLARE_ENV;

function run(command: string, args: string[], options: { capture?: boolean; env?: NodeJS.ProcessEnv } = {}): string {
  const result = spawnSync(command, args, { stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit', encoding: 'utf8', env: options.env ?? process.env });
  if (result.status !== 0) {
    console.error(`✗ ${command} ${args.join(' ')} failed`);
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? '';
}

const status = run('git', ['status', '--porcelain'], { capture: true }).trim();
if (status) {
  console.error('✗ working tree has uncommitted changes; deploy only from a clean worktree');
  process.exit(1);
}
const commit = run('git', ['rev-parse', 'HEAD'], { capture: true }).trim();

run('npm', ['run', 'check:migrations']);
run('npm', ['run', 'build'], { env: buildEnv });
const built = JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8')) as { name: string };
const expectedName = target === 'staging' ? 'seriesbumb-staging' : 'seriesbumb';
if (built.name !== expectedName) {
  console.error(`✗ build targets ${built.name}, expected ${expectedName}`);
  process.exit(1);
}

const bookmarkInfo = JSON.parse(run('npx', ['wrangler', 'd1', 'time-travel', 'info', database, '--json', ...envArgs], { capture: true })) as { bookmark?: string };
console.log(`• D1 bookmark before migrate: ${bookmarkInfo.bookmark ?? 'unknown'}`);
run('npx', ['wrangler', 'd1', 'migrations', 'apply', database, '--remote', ...envArgs]);
run('npx', ['wrangler', 'deploy', '--config', 'dist/server/wrangler.json']);

const response = await fetch(siteUrl, { redirect: 'manual' });
if (response.status !== 200) {
  console.error(`✗ smoke check ${siteUrl} returned ${response.status}; roll back with: npx wrangler rollback --name ${expectedName}`);
  process.exit(1);
}

mkdirSync('.deploys', { recursive: true });
const record = { target, commit, bookmark: bookmarkInfo.bookmark ?? null, deployedAt: new Date().toISOString() };
writeFileSync(`.deploys/${target}-${record.deployedAt.replace(/[:.]/g, '-')}.json`, `${JSON.stringify(record, null, 2)}\n`);
console.log(`✓ deployed ${commit.slice(0, 7)} to ${siteUrl}`);
```

`package.json` scripts: replace `deploy` with `"deploy:prod": "node --experimental-strip-types scripts/deploy.ts production"`, add `"deploy:staging": "node --experimental-strip-types scripts/deploy.ts staging"`, keep `"deploy": "npm run deploy:prod"`. `.gitignore`: add `.deploys/`.

- [ ] **Step 6: Set staging secrets** (values never echoed)

```bash
node -e "process.stdout.write(require('crypto').randomBytes(36).toString('base64url'))" | npx wrangler secret put BETTER_AUTH_SECRET --env staging
printf '%s' 'phetjaa030@gmail.com,seriesbumb@gmail.com' | npx wrangler secret put ADMIN_EMAILS --env staging
```
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`: pipe the values from `.dev.vars` into `wrangler secret put ... --env staging` without printing them. Staging gets no `SUPABASE_SECRET_KEY` (uploads and audio stay disabled there).

- [ ] **Step 7: Deploy staging and verify**

Run: `npm run deploy:staging` (from a clean worktree after committing Tasks 1–4)
Expected: migrations 0000–0010 applied to `seriesbumb-staging`, `✓ deployed <sha> to https://seriesbumb-staging.phetjaa.workers.dev`. Then `curl -sI https://seriesbumb-staging.phetjaa.workers.dev/ | grep -i x-robots-tag` prints `noindex, nofollow`, and `curl -s https://seriesbumb-staging.phetjaa.workers.dev/robots.txt` prints `Disallow: /`.

- [ ] **Step 8: Commit**

```bash
git add wrangler.jsonc astro.config.mjs scripts/deploy.ts package.json .gitignore
git commit -m "feat(deploy): add staging environment and bookmark-first deploy script"
```

---

### Task 5: E2E smoke tests

**Files:**
- Modify: `playwright.config.ts`
- Create: `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `E2E_BASE_URL` env var (defaults to local dev server).

- [ ] **Step 1: Write the tests** — `tests/e2e/smoke.spec.ts`

```ts
import { expect, test } from '@playwright/test';

test('home renders the Thai shell with security headers', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  const headers = response!.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['content-security-policy']).toContain("default-src 'self'");
});

test('admin redirects guests to login with a safe next path', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
});

test('public pages load without CSP violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) violations.push(message.text()); });
  for (const path of ['/', '/tapes', '/songs', '/artists', '/search?q=%E0%B9%80%E0%B8%97%E0%B8%9B']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
  }
  expect(violations).toEqual([]);
});

test('unknown pages return the Thai 404', async ({ page }) => {
  const response = await page.goto('/no-such-page-for-smoke');
  expect(response?.status()).toBe(404);
});
```

- [ ] **Step 2: Point Playwright at any base URL** — in `playwright.config.ts` set `baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4321'` and only define `webServer` when `E2E_BASE_URL` is unset:

```ts
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
```

- [ ] **Step 3: Run against staging**

Run: `npx playwright install chromium && E2E_BASE_URL=https://seriesbumb-staging.phetjaa.workers.dev npm run test:e2e`
Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e/smoke.spec.ts
git commit -m "test(e2e): smoke-test headers, admin gate, CSP and 404 on any base URL"
```

---

### Task 6: Repository rules and accurate docs

**Files:**
- Create: `CLAUDE.md`
- Modify: `README.md` (line 3 stack sentence, Deploy section, image backup sentence)

- [ ] **Step 1: Write `CLAUDE.md`** with: real stack (Astro 7 SSR on Workers, D1, better-auth Google, images in Supabase public bucket `SeriesBumbImages`, private audio in Supabase `SeriesBumb`, Firebase legacy/disabled); free-tier limits from spec §2; rules — one branch + worktree per task, PR to `main`, never push secrets, migrations only via `npm run db:generate`, never rename applied migrations (`0006_artist_profile.sql` stays), deploy only with `npm run deploy:staging` then `npm run deploy:prod` from a clean worktree, feature flags for signup-only services default off; commands table.

- [ ] **Step 2: Fix README** — line 3 becomes “เว็บสารานุกรมเทปเพลงไทย ใช้ Astro บน Cloudflare Workers พร้อม D1, Supabase Storage สำหรับรูปและคลังเสียงส่วนตัว และระบบเข้าสู่ระบบด้วย Google”; the Deploy section uses `npm run deploy:staging` / `npm run deploy:prod` and mentions staging URL; the backup note says to back up Supabase Storage files separately.

- [ ] **Step 3: Verify and commit**

Run: `npm run lint`
Expected: 0 errors.

```bash
git add CLAUDE.md README.md
git commit -m "docs: repository rules and accurate stack for long-term maintenance"
```

---

### Task 7: Ship Phase 0

- [ ] **Step 1:** `git push -u origin feat/free-demo-phase0` and `gh pr create --fill --base main` (body lists spec, tasks, test evidence; ends with the Claude Code attribution line).
- [ ] **Step 2:** Wait for CI; fix anything red with a new commit.
- [ ] **Step 3:** Rebase on `origin/main` if it moved, re-run `npm test && npm run test:int`, then `gh pr merge --squash --delete-branch`.
- [ ] **Step 4:** From a clean worktree at the merged `main`: `npm run deploy:staging`, `E2E_BASE_URL=https://seriesbumb-staging.phetjaa.workers.dev npm run test:e2e`, then `npm run deploy:prod` and `E2E_BASE_URL=https://seriesbumb.phetjaa.workers.dev npm run test:e2e`.
- [ ] **Step 5:** Report results and the owner checklist item “add staging OAuth redirect URI”.
