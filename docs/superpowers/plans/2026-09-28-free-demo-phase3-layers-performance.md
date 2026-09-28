# Free Demo Phase 3: Layered Structure and Query Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every module one layer with enforced boundaries, move all SQL out of pages and services into repositories and loaders, and keep each page inside a measured D1 rows-read budget. This is the preparation for moving the database, storage or hosting later.

**Architecture:** Three PRs:
- **3a** moves modules into `domain/ auth/ http/ storage/ errors/ platform/ actions/`. It adds `platform/runtime.ts` as the only importer of `cloudflare:*` and a single `AppError` taxonomy, and turns the ESLint boundary rules on. Behaviour stays the same.
- **3b** adds `repositories/*.repo.ts`, which own every SQL string, and `loaders/*.ts` read models. Each page calls one loader.
- **3c** adds budget tests (summed `meta.rows_read` + `EXPLAIN QUERY PLAN`) and fixes the known hotspots.

**Tech Stack:** Astro 7.3.5, D1, vitest + @cloudflare/vitest-plugin (workerd), ESLint flat config `no-restricted-imports`.

**Spec:** `docs/superpowers/specs/2026-09-28-seriesbumb-free-production-ready-design.md` §3, §7, §11.

## Global Constraints

- $0/month. No new runtime dependencies.
- Behaviour-neutral in 3a/3b: the same HTML, status codes, headers and D1 writes. The existing 230 unit and 77 integration tests must pass unchanged, except for import paths.
- Boundaries, enforced by ESLint once 3a lands:
  - `pages/`, `components/` and `actions/` never import `cloudflare:*`, `db/*` or `repositories/*`.
  - `repositories/` never imports `astro:*`.
  - `domain/` imports only `domain/**` and `errors/app-error`.
  - `cloudflare:*` is imported only in `platform/**`, plus `worker.ts` in Phase 4.
- Thai UI copy is unchanged. Tests first for every behaviour change (3c).

---

## 3a — Structure and boundaries (PR 1)

### Task 1: Module move codemod
**Files:** Create `scripts/move-modules.ts` (dev-only; deleted in the same PR after use) and `scripts/lib/rewrite-imports.ts` with test `tests/unit/rewrite-imports.test.ts`.
**Interfaces:** `rewriteImports(source: string, fromFile: string, toFile: string, moved: Map<string, string>): string` resolves each relative specifier (`from '…'`, `import '…'`, `import('…')`, `vi.mock('…')`) against the importer's OLD path, tries `.ts/.tsx/.astro/index.ts`, maps the target through `moved`, and re-relativises from the importer's NEW path, keeping the specifier's original extension style.
- [ ] Failing unit tests: a moved importer with an unmoved target, an unmoved importer with a moved target, both moved, `.astro` targets, `../../db/enums` style, side-effect imports, `import type`.
- [ ] Implement; `scripts/move-modules.ts` runs `git mv` for each pair, then rewrites every file under `src/ tests/ scripts/ astro.config.mjs`.
- [ ] Move map (old → new):

| Old | New |
| --- | --- |
| `src/lib/{thai,slug,search,format,urls,provinces,song-notes,types,admin-session,admin-emails}.ts` | `src/domain/<same>.ts` |
| `src/lib/queries/cursor.ts` | `src/domain/cursor.ts` |
| `src/db/enums.ts` | `src/domain/enums.ts` (`src/db/enums.ts` re-exports for `schema.ts`) |
| `src/lib/{auth,auth-routes,permissions,access-jwt}.ts` | `src/auth/<same>.ts` |
| `src/lib/middleware/*.ts` | `src/http/middleware/*.ts` |
| `src/lib/{http-headers,robots,rate-limit,turnstile,admin-surface}.ts` | `src/http/<same>.ts` (`http-headers` → `headers`) |
| `src/lib/services/audio-http.ts` | `src/http/audio-http.ts` |
| `src/lib/services/{image-store,supabase-image-store,firebase-image-store,audio-store}.ts` | `src/storage/<same>.ts` |
| `src/lib/errors.ts` | `src/errors/d1.ts` |
| `src/lib/actions.ts` | `src/actions/define.ts` |
| `src/lib/schemas.ts` | `src/actions/schemas.ts` |
| `src/lib/services/*.ts` (rest) | `src/services/<same>.ts` |
| `src/lib/queries/*.ts` (rest) | `src/repositories/<same>.repo.ts` (renamed properly in 3b) |
| `src/lib/client/*` | `src/client/*` |

- [ ] Run it, then `npm run lint && npm run check && npm test && npm run test:int && npm run build` all green; commit `refactor: move modules into layered directories`.

### Task 2: Platform runtime
**Files:** Create `src/platform/runtime.ts` and `src/platform/stores.ts`. Modify every file that imports `cloudflare:workers` under `src/` except `platform/`. Test `tests/unit/runtime.test.ts`.
**Interfaces:**
```ts
// src/platform/runtime.ts — the only module (with stores.ts) that imports cloudflare:workers
export const db = (): D1Database => env.DB;
export const config = (): AppConfig => getConfig(env);
export const background = (task: Promise<unknown>): void => waitUntil(task);
export const rateLimiters = () => ({ auth: env.AUTH_RATE_LIMITER, write: env.WRITE_RATE_LIMITER });
// src/platform/stores.ts
export const imageStore = (): ImageStore => supabaseImageStore(env);
export const audioStores = (): AudioStores => …; // same selection as today, driven by config().audio
```
- [ ] Replace `env.DB` → `db()`, `env.SITE_URL` → `config().siteUrl`, `env.IMAGE_BASE_URL` → `config().images.baseUrl`, `env.ADMIN_EMAILS` → `config().auth.adminEmailsRaw` (add a raw string field; `setUserRole` keeps its string parameter), and storage `env.*` → the store factories.
- [ ] `grep -rn "cloudflare:workers" src | grep -v src/platform/` returns nothing.
- [ ] Commit `refactor(platform): one runtime module owns Cloudflare bindings`.

### Task 3: One error taxonomy
**Files:** Create `src/errors/app-error.ts`, `src/errors/to-action-error.ts` and `src/errors/to-response.ts`. Modify `CatalogError`, `CommentError`, `ReviewError` and `AudioArchiveError` to extend `AppError`, and the `runCatalog`, `runComment` and `runReview` helpers in actions. Test `tests/unit/app-error.test.ts`.
**Interfaces:**
```ts
export type AppErrorCode = 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'TOO_MANY_REQUESTS' | 'SERVICE_UNAVAILABLE' | 'INTERNAL_SERVER_ERROR';
export class AppError extends Error { constructor(message: string, readonly code: AppErrorCode = 'BAD_REQUEST', options?: { cause?: unknown }) }
export function toActionError(error: unknown, fallback: string): ActionError; // AppError → same code/message; D1 quota → SERVICE_UNAVAILABLE 'ระบบใช้โควตาประจำวันครบแล้ว กรุณาลองใหม่พรุ่งนี้'; else logs name only → INTERNAL_SERVER_ERROR fallback
export function toJsonError(error: unknown, fallback: string): Response;
```
- [ ] Failing tests: code/message are preserved; the D1 quota error becomes 503; unknown errors never leak their message.
- [ ] `runCatalog`, `runComment` and `runReview` collapse into `toActionError` with the same Thai fallbacks. `runCatalog` keeps BAD_REQUEST for unknown errors, because the current UI copy says "ตรวจข้อมูลแล้วลองอีกครั้ง".
- [ ] Commit `refactor(errors): one AppError taxonomy mapped once to actions and JSON`.

### Task 4: Split actions by domain
**Files:** `src/actions/index.ts` → `src/actions/{reviews,comments,engagement,catalog-admin,community-admin,images-admin,search-admin,people-admin}.ts`; `index.ts` only composes `export const server = { … }`, keeping the exact same key paths.
- [ ] Unit test `tests/unit/action-names.test.ts` snapshots the flattened action key list, recorded before the split.
- [ ] Commit `refactor(actions): one file per domain`.

### Task 5: Boundary rules
**Files:** `eslint.config.js`
- [ ] Add `no-restricted-imports` blocks per directory as in Global Constraints (patterns `cloudflare:*`, `**/db/*`, `**/repositories/*`, `astro:*`).
- [ ] Prove each rule once by adding a violating import locally, seeing lint fail, then removing it.
- [ ] Commit `build(lint): enforce layer boundaries`.

### Task 6: Ship 3a
- [ ] Full checks, PR, CI, merge, staging deploy + e2e, prod deploy + e2e (no migration).

---

## 3b — Repositories and loaders (PR 2)

### Task 7: Repositories own all SQL
**Files:** Create `src/repositories/{tapes,songs,artists,labels,genres,collections,people,search,community,users,audio,images,stats,audit,sources,relations,credits}.repo.ts`. Each function takes `SqlClient` (`src/db/sql-client.ts`: `export type SqlClient = Pick<D1Database, 'prepare' | 'batch'>`).
- [ ] Move SQL out of `services/*` into repositories. Services keep invariants, batching order and storage calls, and hold no SQL strings. `grep -nE "prepare\(|SELECT |INSERT |UPDATE |DELETE " src/services` returns nothing.
- [ ] The existing integration tests (services through D1) stay green without edits.

### Task 8: Loaders, one per page
**Files:** Create `src/loaders/{home,tapes,tape-detail,songs,song-detail,artists,artist-detail,labels,label-detail,genres,genre-detail,collections,collection-detail,decades,people-detail,latest,reviews,random,search,advanced-search,me,me-submissions,admin/*}.ts`. Modify the 31 pages listed by `grep -rlE "prepare\(" src/pages`.
**Interfaces:** `loadX(sql: SqlClient, params, viewer?: SessionUser | null): Promise<XModel>`. Pages do `const model = await loadX(db(), …)` plus rendering. Keep the not-found and redirect decisions in the page, driven by the model (`null` → 404).
- [ ] Integration test per loader against seeded D1: it returns the same shape the page renders today (fixtures from `tests/integration/helpers`).
- [ ] `grep -rlE "prepare\(|SELECT " src/pages src/components` returns nothing; ESLint boundary for `pages → repositories` passes.
- [ ] Commit per group: public catalog, discovery/search, member, admin.

### Task 9: Ship 3b
- [ ] Full checks, then compare 20 representative public URLs, staging vs production, by HTML hash after removing the CSP nonce and asset hashes. Then PR, CI, merge, deploy both environments, run e2e.

---

## 3c — Query performance (PR 3)

### Task 10: Budget harness
**Files:** Create `tests/integration/helpers/budget.ts` and `tests/integration/budget.test.ts`.
**Interfaces:** `measure(sql: D1Database) → { client: SqlClient; rowsRead(): number; plans(): string[] }` wraps `prepare().bind().{all,first,run}` and `batch`, and sums `meta.rows_read`. For each statement it records `EXPLAIN QUERY PLAN` and flags `SCAN <table>` for `tape`, `song`, `artist`, `tape_track`, `song_artist`, `tape_artist` and `comment`.
- [ ] Seed a medium dataset once per file: 2,000 tapes, 6,000 songs, 800 artists, 12,000 tracks, 3,000 comments (deterministic generator).
- [ ] Record today's rows_read per loader, then set the budget to the fixed target (below). Tests fail above budget.

### Task 11: Hotspot fixes (each: failing budget → fix → green)
- Home: drop the `COUNT(*)` over `song`. Keep `publicSongCount` in `site_stats`, maintained where `song.isPublic` / `publishedTapeCount` change (migration + backfill).
- `/songs`: index `song(titleSort, id)` restricted to public rows (partial index `WHERE isPublic = 1 OR publishedTapeCount > 0`).
- Artist and genre filters: replace `EXISTS` subqueries with a join on the covering index `tape_artist(artistId, tapeId)` / `tape_genre(genreId, tapeId)`.
- `similarArtists` and related tapes: bounded candidate sets (`LIMIT` inside the CTE) over indexed joins.
- Advanced search defaults: no FTS query and no filters → the tapes listing loader instead of a full scan.
- `/artists/random`: `rowid`-range pick (`WHERE rowid >= abs(random()) % (max+1) LIMIT 1`, with a wrap-around fallback) instead of `OFFSET`.
- Reindex cursor: `(updatedAt, id)` keyset instead of OFFSET.
- `audioUsage`: aggregate only the current UTC day (`WHERE day = ?`), indexed.
- `saveTape`: diff tracks, genres and artists, and write only changed rows instead of delete-all + insert. This cuts D1 writes on every save.
- Session lookup: `loadSession` reads the session once per request (memoised on `locals`) and never on static asset paths.
- [ ] Migration via `npm run db:generate`; `check:migrations` ✓; migration applied to staging before prod.

### Task 12: Ship 3c
- [ ] Full checks + budget tests in CI, PR, merge, staging deploy (migration) + e2e, prod deploy (bookmark first) + e2e, and a D1 metrics check the next day (rows read/day).
