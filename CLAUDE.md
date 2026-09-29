# SeriesBumb — repository rules

Thai cassette-tape encyclopedia. All UI copy is Thai. Production: https://seriesbumb.phetjaa.workers.dev · Staging: https://seriesbumb-staging.phetjaa.workers.dev

## Stack (actual, not the original spec)

- Astro 7 SSR (`output: 'server'`) on one Cloudflare Worker via `@astrojs/cloudflare`; React 19 islands; Tailwind 4 tokens + hand-written CSS in `src/styles/global.css`
- Cloudflare D1 (SQLite) through binding `DB`; Drizzle schema in `src/db/schema.ts`, mostly raw SQL via `db().prepare().bind()` and `batch()`
- better-auth + Google OAuth; roles `member` / `admin`; bootstrap admins from secret `ADMIN_EMAILS`
- Public images: Supabase Storage bucket `SeriesBumbImages`. Private admin audio: Supabase bucket `SeriesBumb` via signed upload URLs. Firebase Storage is legacy and disabled — never re-enable uploads there (Blaze has no spend cap)
- Config: every env value goes through `src/config/env.schema.ts` → `config()` from `src/platform/runtime.ts`; add new keys to the schema, never read `env.X` outside `src/platform/`

## Layers (enforced by `eslint.config.mjs`, guarded by `tests/unit/lint-boundaries.test.ts`)

| Directory | Holds | May not import |
| --- | --- | --- |
| `src/platform/` | `runtime.ts`: the only code that touches `cloudflare:workers` (`db()`, `config()`, `imageStore()`, `background()`…); `siteUrlOr()` for page shells that must render even with invalid config | — |
| `src/domain/` | Pure rules and types (Thai text, slugs, cursors, URLs, enums, admin session policy) | packages, or anything outside `domain/` except `errors/app-error` |
| `src/errors/` | `AppError` taxonomy; `toActionError` / `toJsonError` mappers | — |
| `src/repositories/` | SQL reads (moving here in Phase 3b) | `astro:*`, `cloudflare:*` |
| `src/services/` | Write use cases and invariants | `astro:*`, `cloudflare:*` |
| `src/storage/` | Image/audio store adapters (Supabase, legacy Firebase) | — |
| `src/auth/`, `src/http/` | better-auth, permissions, Access JWT; middleware, headers, Turnstile, rate limits | — |
| `src/actions/` | `define.ts` wrappers, zod schemas, one file per domain, `index.ts` composes names | `cloudflare:*`, `db/*` |
| `src/pages/`, `src/components/` | Rendering | `cloudflare:*`, `db/*` |

`scripts/lib/rewrite-imports.ts` rewrites relative imports when modules move; keep `tests/unit/action-names.test.ts` green (client code calls actions by those names).

## Free-tier limits the code must respect

Workers Free 100k requests/day and 10 ms CPU; D1 Free 5M rows read/day, 100k rows written/day, 500 MB per DB, Time Travel 7 days; Supabase Free 1 GB storage and 5 GB egress per project, 50 MB per file. workers.dev has no zone WAF, so abuse protection lives in code. Monthly cost must stay $0 unless the owner approves otherwise.

## Working rules

- Several Claude/Codex sessions work here concurrently. One task = one branch + one git worktree under `~/Downloads/code/SeriesBumb-worktrees/`; open a PR to `main`, merge after CI is green. Never edit another session's uncommitted files.
- Migrations: only `npm run db:generate` (use `drizzle-kit generate --custom` for hand-written SQL). Never edit or rename an applied migration. `migrations/0006_artist_profile.sql` is intentionally outside the journal and stays. `npm run check:migrations` must pass. Migrations must be backward-compatible with the previous Worker version (expand → deploy → contract).
- Deploy only with `npm run deploy:staging`, then `npm run deploy:prod`, from a clean worktree; run `E2E_BASE_URL=<url> npm run test:e2e` after each. Preview URLs of the production Worker use production bindings — do not test DB writes there.
- Secrets only via `npx wrangler secret put <KEY> [--env staging]`. Never put secrets in `vars`, commits, logs or chat.
- Services that need a signup (Turnstile, Cloudflare Access, uptime/error monitoring, a second Supabase project, backup tokens) ship behind config flags that default off.
- Tests first for every behavior change. Keep `npm run lint`, `npm run check`, `npm test`, `npm run test:int` green.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev at http://localhost:4321 (needs `.dev.vars`, `npm run db:migrate:local`) |
| `npm test` / `npm run test:int` | Unit (Node) / integration (workerd + D1 + real migrations) |
| `npm run test:e2e` | Playwright smoke; set `E2E_BASE_URL` for staging/production |
| `npm run check:migrations` | Migration files vs Drizzle journal |
| `npm run deploy:staging` / `npm run deploy:prod` | Bookmark → migrate → deploy → smoke check |
| `npm run backup:export` / `npm run restore:export` | Data-only D1 export (no sessions/tokens/search tables, outside the repo, 0600) and a guarded restore into a fresh migrated DB, in FK-ordered parts that fit D1 Free daily writes; see `docs/runbooks/backup-restore.md` |
| `npm run backup:storage` | Incremental, checksummed copy of Supabase buckets to a local folder (owner machine only) |

## Plans and specs

`docs/superpowers/specs/2026-09-28-seriesbumb-free-production-ready-design.md` is the current roadmap (phases 0–6). Phase plans live in `docs/superpowers/plans/`.
