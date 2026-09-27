# SeriesBumb Plan 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable Astro 7 + Cloudflare Workers shell for SeriesBumb. It has the full D1 schema, Google login with admin/member roles, route and action guards, the dark "encyclopaedia" layout, and the unit, integration and E2E test harnesses that later plans build on.

**Architecture:**
- Astro SSR (`output: 'server'`) on Cloudflare Workers through `@astrojs/cloudflare`, with D1 (Drizzle ORM) and R2 bindings, and Better Auth for Google OAuth sessions stored in D1.
- Pure TypeScript utilities (Thai sorting, slugs, URLs, formatting) are unit-tested in Node.
- DB-touching code is integration-tested inside workerd via `@cloudflare/vitest-plugin`.
- Pages are E2E-tested with Playwright against `astro dev`.

**Tech Stack:** Astro 7.x, @astrojs/cloudflare 14.x, React 19 (islands, later plans), Tailwind CSS 4.x, Drizzle ORM 0.45 + drizzle-kit 0.31, Better Auth 1.7 + @better-auth/drizzle-adapter, Motion 13, Vitest 4.1 + @cloudflare/vitest-plugin 1.x, Playwright, Wrangler 4.

**Spec:** `docs/superpowers/specs/2026-09-25-seriesbumb-design.md`. Section numbers like "spec §3.2" refer to that file.

## Roadmap (this is plan 1 of 5)

Each plan ends with working, tested software. Write each plan after the one before it is implemented, so it can target real code.

| Plan | Scope | Deliverable |
|---|---|---|
| **1 Foundation** (this file) | scaffold, config, D1 schema and migrations (all tables + FTS5), Thai/slug/url/format utils, Better Auth Google + roles, middleware guards, action wrappers, design tokens and layout shell, error pages, login, admin dashboard shell, test harnesses | Site runs locally and deploys. Login works. Admin/member/visitor gating is enforced and tested. |
| 2 Admin catalog | services and admin actions for tapes/songs/artists/members/labels/genres/collections, R2 uploads and browser resize/OG, visibility counts, search indexing and queue, redirects, site_stats, all admin forms | An admin can build the whole catalog. |
| 3 Public catalog | read queries and every public page (spec §4.2–4.5), listings, keyset, partials, filters, search page, SEO/OG/robots, lightbox, load-more, filter-bar, bio-expand, Motion animations, og-default.jpg | Visitors can browse and search everything. |
| 4 Members | likes, owns, comments (list/create/delete, rate limit), /me, admin comment moderation, admin users (roles/bans) | Members can engage, and admins can moderate. |
| 5 Hardening & launch | rows-read budget harness + seed, EXPLAIN QUERY PLAN rule tests, automatic admin-action auth enumeration test, CSP verification, backup/restore scripts, README deploy guide, production deploy | Production launch. |

## Global Constraints

Every task follows these rules. Values are copied from the spec.

**Runtime and packages**

- Node ≥22.12. Package manager: npm. TypeScript `strict: true`.
- Pinned majors (spec §6.1):
  - Framework: `astro@^7.3`, `@astrojs/cloudflare@^14`, `@astrojs/react`, `react@^19`, `wrangler@^4`
  - Auth and DB: `better-auth@^1.7` + `@better-auth/drizzle-adapter@^1.7`, `drizzle-orm@^0.45` + `drizzle-kit@^0.31` (not 1.0 RC)
  - UI: `motion@^13`, `tailwindcss@^4.3` + `@tailwindcss/vite@^4.3`
  - Testing: `vitest@~4.1` + `@cloudflare/vitest-plugin@^1` (NOT Vitest 5), `@playwright/test`
- Import Zod as `import { z } from 'astro/zod'` (Zod 4). Never import from `zod` directly in app code.

**Cloudflare configuration**

- Read bindings/vars/secrets with `import { env } from 'cloudflare:workers'`. `Astro.locals.runtime` does not exist.
- Use `Astro.locals.cfContext.waitUntil()` for work after the response.
- Binding names: `DB` (D1), `BUCKET` (R2). Never name any binding `IMAGES`.
- Adapter: `imageService: 'passthrough'`. Astro config: `session: false`, `security.actionBodySizeLimit: 4 * 1024 * 1024`.
- `wrangler.jsonc`: `compatibility_flags: ["nodejs_compat"]`, `observability.enabled = true`.
- No `<ClientRouter />` and no View Transitions. Full page loads only.

**Data**

- IDs: text `crypto.randomUUID()`. The only exception is `search_doc.docId`, which is `INTEGER PRIMARY KEY`.
- Timestamps: integer unix ms. Better Auth tables use Drizzle `integer(..., { mode: 'timestamp_ms' })`, because the adapter needs `Date`. App tables use plain `integer` ms numbers.
- DB naming: table names snake_case as in spec §3 (`tape_artist`, `site_stats`, …). Column names camelCase (`createdAt`, `publishedTapeCount`).
- Never use Drizzle `$onUpdate` / `$onUpdateFn`. Set `updatedAt` / `updatedBy` explicitly in admin writes only.

**D1 limits**

- ≤50 queries per request, counting every statement inside `db.batch()`.
- ≤100 bound parameters per statement. Multi-row writes go through `json_each(?)` with one JSON parameter, built with `jsonParam()`.
- Migrations live in `migrations/*.sql` and must use LF line endings (`.gitattributes`: `migrations/*.sql text eol=lf`).
- Any migration that recreates a table starts with `PRAGMA defer_foreign_keys = on;`.

**Security**

- Better Auth: `user.additionalFields.role` and `.commentBanned` are declared with `input: false`.
- Better Auth: `disabledPaths: ['/update-user']`. No `session.cookieCache`.
- User-entered text is rendered only with `{}` expressions. `set:html` and `dangerouslySetInnerHTML` are forbidden.
- No `style="…"` attribute in server-rendered HTML (CSP). Use classes instead. Setting styles from JS is allowed.

**UI**

- UI copy is Thai, `<html lang="th">`. No emoji in UI.
- Colors come only from the tokens in spec §9.2. No opacity on text.
- Fonts are self-hosted via fontsource:
  - `@fontsource/noto-serif-thai` weight 500
  - `@fontsource/ibm-plex-sans-thai` weights 400/500
  - `@fontsource/ibm-plex-mono` weight 400
  - Thai + Latin subsets only.

**Workflow**

- Test commands:
  - `npm test` runs unit tests (Node).
  - `npm run test:int` runs integration tests (workerd + Miniflare D1/R2).
  - `npm run test:e2e` runs Playwright.
  - `npm run lint` runs ESLint (flat config; `astro/no-set-html-directive` and `react/no-danger` are errors).
  - `npm run check` runs `astro check`.
- Unit tests run in Node with `cloudflare:workers` aliased to `tests/unit/stubs/cloudflare-workers.ts`. DOM-script tests use `// @vitest-environment happy-dom`. Astro component tests use the Astro Container API. Anything that needs real D1/R2 is an integration test.
- Commit after every task. Commit messages end with a blank line followed by `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure (created in this plan)

```
package.json, tsconfig.json, astro.config.mjs, wrangler.jsonc, drizzle.config.ts
vitest.config.ts                  unit tests (Node env) — tests/unit/**/*.test.ts
vitest.integration.config.ts      integration tests (@cloudflare/vitest-plugin) — tests/integration/**/*.test.ts
playwright.config.ts              E2E — tests/e2e/**/*.spec.ts
.gitattributes, .dev.vars.example, README.md (Thai, local dev section)
worker-configuration.d.ts         generated by `wrangler types` (Env interface)
src/env.d.ts                      App.Locals typing
src/lib/types.ts                  shared types: Role, SessionUser
src/db/enums.ts                   enum value arrays shared by schema + Zod
src/db/schema.ts                  every table in spec §3 (Better Auth tables + app tables)
src/db/client.ts                  getDb(), jsonParam(), Db type
migrations/0000_*.sql             drizzle-kit generated (tables, FKs, most indexes)
migrations/0001_search_fts.sql    drizzle-kit --custom: FTS5 trigram table + site_stats seed row + PRAGMA optimize
src/lib/thai.ts                   normalizeThai, stripThaiMarks, thaiSortKey
src/lib/slug.ts                   SLUG_RE, slugify, slugCandidates, decodePathSegments, normalizePath
src/lib/urls.ts                   safeNextPath, canonicalUrl, imageUrl, thumbKeyFromFull
src/lib/format.ts                 year/date/duration/label formatting and parsing
src/lib/provinces.ts              REGIONS, PROVINCES (77 + ต่างประเทศ), PROVINCE_NAMES, isProvince
src/lib/errors.ts                 isD1QuotaError
src/lib/permissions.ts            parseAdminEmails, isAdmin, requireUser, requireAdmin, canComment
src/lib/auth.ts                   createAuth, getAuth, promoteAdmins, bumpUserCount
src/lib/client/auth-client.ts     browser Better Auth client
src/lib/actions.ts                defineAdminAction, defineMemberAction
src/lib/middleware/*.ts           securityHeaders, loadSession, guardPaths, guardAdminActions, redirectOn404
src/middleware.ts                 onRequest = sequence(...)
src/actions/index.ts              server = { admin: { health } }
src/pages/api/auth/[...all].ts    Better Auth handler
src/styles/global.css             Tailwind v4 import + @theme tokens (spec §9.2) + base styles
src/components/layout/            BaseLayout, Header, Sidebar, Footer, AdminLayout, AdminNav, CreditLine
src/components/ui/                InfoBox, Tabs, Tag, Placeholder, CassetteIcon
src/scripts/                      tabs.ts, mobile-nav.ts, avatar-menu.ts
src/pages/                        index.astro, login.astro, 403.astro, 404.astro, 500.astro, admin/index.astro
public/favicon.svg
tests/unit/, tests/integration/, tests/e2e/
```

## Interface Contract

Every task implements these names and signatures exactly. Later plans depend on them.

```ts
// src/lib/types.ts (Task 1)
export type Role = 'member' | 'admin';
export interface SessionUser {
  id: string; name: string; email: string; image: string | null;
  role: Role; commentBanned: boolean;
}

// src/env.d.ts (Task 1)
declare namespace App {
  interface Locals {
    user: import('./lib/types').SessionUser | null;
    session: { id: string; expiresAt: Date } | null;
  }
}
// Env (worker-configuration.d.ts, from `wrangler types`, Task 1): DB: D1Database; BUCKET: R2Bucket;
// SITE_URL, IMAGE_BASE_URL, CF_BEACON_TOKEN (vars); BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID,
// GOOGLE_CLIENT_SECRET, ADMIN_EMAILS (secrets, declared for typing via .dev.vars.example)

// src/db/enums.ts (Task 5)
export const RELEASE_TYPES = ['album','compilation','soundtrack','single','other'] as const;
export const TAPE_STATUSES = ['draft','published'] as const;
export const IMAGE_KINDS = ['front','back','inside','cassette','other'] as const;
export const SIDES = ['A','B','C','D'] as const;
export const ARTIST_TYPES = ['band','solo','group'] as const;           // column nullable
export const ARTIST_STATUSES = ['active','inactive','hiatus','deceased','unknown'] as const;
export const ROLES = ['member','admin'] as const;
export const SEARCH_KINDS = ['tape','song','artist','label','collection'] as const;
export type ReleaseType = typeof RELEASE_TYPES[number]; // …and one type alias per array

// src/db/schema.ts (Task 5) — Drizzle sqlite tables, exported names (SQL table name in parens):
// user(user) session(session) account(account) verification(verification)
// artist(artist) artistMember(artist_member) label(label) genre(genre)
// tape(tape) tapeArtist(tape_artist) tapeGenre(tape_genre) tapeImage(tape_image)
// song(song) songArtist(song_artist) tapeTrack(tape_track)
// collection(collection) collectionItem(collection_item)
// tapeLike(tape_like) songLike(song_like) tapeOwner(tape_owner) comment(comment)
// searchDoc(search_doc) searchQueue(search_queue) redirect(redirect) siteStats(site_stats)
// search_fts is raw SQL only (FTS5), not in schema.ts.

// src/db/client.ts (Task 5)
export type Db = import('drizzle-orm/d1').DrizzleD1Database<typeof import('./schema')>;
export function getDb(d1: D1Database): Db;                 // drizzle(d1, { schema })
export function jsonParam(value: unknown): string;         // JSON.stringify for json_each(?)

// src/lib/thai.ts (Task 2)
export function normalizeThai(s: string): string;   // NFC → strip U+200B–U+200D,U+FEFF → 'ํา'→'ำ' → lowercase → ๐-๙→0-9
export function stripThaiMarks(s: string): string;  // remove U+0E47–U+0E4E
export function thaiSortKey(s: string): string;     // spec §6.4 algorithm; group char '0'|'1'|'2' first

// src/lib/slug.ts (Task 3)
export const SLUG_RE: RegExp;                       // /^[a-z0-9ก-๛]+(-[a-z0-9ก-๛]+)*$/u
export const SLUG_MAX = 80;
export function slugify(title: string): string;     // base ≤50 codepoints, cut at word boundary; '' if nothing usable
export function slugCandidates(base: string, opts?: { year?: number | null; qualifierSlug?: string | null }): string[];
  // [base(-year)?, base(-year)?-qualifier (≤76), …-2, …-3, …-4, …-5]; every item ≤80 and matches SLUG_RE
export function decodePathSegments(pathname: string): string[] | null;  // per-segment decodeURIComponent + NFC; null on URIError
export function normalizePath(pathname: string): string | null;         // '/' + decoded segments joined, no trailing slash

// src/lib/urls.ts (Task 4)
export function safeNextPath(next: string | null | undefined, siteUrl: string): string;
export function canonicalUrl(path: string, siteUrl: string): string;   // siteUrl + encodeURI(path NFC)
export function imageUrl(key: string, imageBaseUrl: string): string;
export function thumbKeyFromFull(fullKey: string): string;             // '-full.' → '-thumb.'

// src/lib/format.ts (Task 4)
export function toCeYear(input: number): number;                       // >2400 → input-543
export function formatYear(year: number | null): string;               // 'พ.ศ. 2541 · 1998' | '—'
export function yearSortOf(year: number | null): number;               // year ?? 9999
export function decadeOf(year: number | null): number | null;          // floor(y/10)*10
export function formatDuration(sec: number | null): string;            // 252 → '4:12'; null → ''
export function parseDuration(text: string): number | null;           // '4:12' → 252; invalid → null
export function formatDate(ms: number): string;                        // 'YYYY-MM-DD' in Asia/Bangkok
export function artistTypeLabel(t: ArtistType | null): string;         // band→'วงดนตรี' solo→'ศิลปินเดี่ยว' group→'ดูโอ/กลุ่มนักร้อง' null→'—'
export function artistStatusLabel(s: ArtistStatus, t: ArtistType | null): string; // spec §4.3
export function releaseTypeLabel(t: ReleaseType): string;              // album→'อัลบั้ม' compilation→'รวมฮิต' soundtrack→'เพลงประกอบ' single→'ซิงเกิล' other→'อื่นๆ'

// src/lib/provinces.ts (Task 4)
export const REGIONS: readonly ['เหนือ','อีสาน','กลาง','ตะวันออก','ตะวันตก','ใต้'];
export type Region = typeof REGIONS[number];
export const FOREIGN = 'ต่างประเทศ';
export const PROVINCES: readonly { name: string; region: Region }[];   // exactly 77
export const PROVINCE_NAMES: readonly string[];                        // 77 names + FOREIGN
export function isProvince(v: string): boolean;

// tests/unit/stubs/cloudflare-workers.ts (Task 1) — vitest.config.ts aliases 'cloudflare:workers' to this file
export const env: Record<string, unknown>;   // mutable test env: SITE_URL 'http://localhost:4321', IMAGE_BASE_URL, ADMIN_EMAILS, …
export function waitUntil(p: Promise<unknown>): void;  // no-op

// src/lib/queries/site-stats.ts (Task 10)
export interface SiteStats { tapeCount: number; publishedTapeCount: number; songCount: number; userCount: number; imageBytes: number }
export async function getSiteStats(db: Db): Promise<SiteStats>;          // reads site_stats row id=1 (zeros if missing)
export async function getDbSizeBytes(d1: D1Database): Promise<number | null>; // meta.size_after of a trivial query

// src/lib/errors.ts (Task 7)
export function isD1QuotaError(err: unknown): boolean;

// src/lib/permissions.ts (Task 7)
export function parseAdminEmails(raw: string | undefined | null): Set<string>;
export function isAdmin(user: SessionUser | null): boolean;
export function requireUser(locals: App.Locals): SessionUser;    // throws ActionError({ code: 'UNAUTHORIZED' })
export function requireAdmin(locals: App.Locals): SessionUser;   // UNAUTHORIZED if null, FORBIDDEN if member
export function canComment(user: SessionUser | null): boolean;   // !!user && !user.commentBanned

// src/lib/auth.ts (Task 6)
export interface AuthEnv { SITE_URL: string; BETTER_AUTH_SECRET: string; GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; ADMIN_EMAILS?: string }
export function createAuth(d1: D1Database, authEnv: AuthEnv): Auth;  // Auth = ReturnType<typeof betterAuth<…>>
export function getAuth(): Auth;                                      // module-level memo over env from 'cloudflare:workers'
export async function promoteAdmins(db: Db, userId: string, adminEmails: Set<string>): Promise<void>;
export async function bumpUserCount(db: Db): Promise<void>;

// src/lib/client/auth-client.ts (Task 6)
export const authClient: ReturnType<typeof import('better-auth/client').createAuthClient>;

// src/lib/actions.ts (Task 7)
// defineAdminAction / defineMemberAction take the same options as astro:actions defineAction,
// except the handler receives (input, context) where context.user: SessionUser is guaranteed.

// src/actions/index.ts (Task 7)
export const server = { admin: { health: /* defineAdminAction → { ok: true, userId } */ } };

// src/lib/middleware/*.ts (Task 7) — each exports one MiddlewareHandler:
// securityHeaders, loadSession, guardPaths, guardAdminActions, redirectOn404
// src/middleware.ts: export const onRequest = sequence(securityHeaders, loadSession, guardPaths, guardAdminActions, redirectOn404)

// Components (Tasks 8–9), props:
// BaseLayout { title: string; description?: string; canonicalPath?: string; noindex?: boolean;
//              ogImage?: string; ogImageAlt?: string; ogType?: 'website' | 'music.album' }
// AdminLayout { title: string }
// CreditLine { createdByName?: string | null; createdAt: number; updatedByName?: string | null; updatedAt: number }
// InfoBox { items: { label: string; value: string | null; href?: string; tone?: 'default' | 'status' }[] }
// Tabs { tabs: { id: string; label: string }[] } — default slot holds one
//      <section id={tab.id} data-tab-panel><h2>…</h2>…</section> per tab; src/scripts/tabs.ts enhances every [data-tabs]
// Tag { tone?: 'default' | 'accent' } (slot)
// Placeholder { label?: string; class?: string }
// CassetteIcon { class?: string } (SVG, currentColor)
```

## Tasks

| # | Task | Produces |
|---|---|---|
| 1 | Project scaffold, config, and test runners | runnable `astro dev` / `astro build`, `npm test`, `npm run test:int`, types |
| 2 | Thai text utilities | `src/lib/thai.ts` |
| 3 | Slug and path utilities | `src/lib/slug.ts` |
| 4 | URL, format, and province utilities | `src/lib/urls.ts`, `src/lib/format.ts`, `src/lib/provinces.ts` |
| 5 | Database schema and migrations | `src/db/*`, `migrations/*` |
| 6 | Better Auth (Google) and admin bootstrap | `src/lib/auth.ts`, auth route, client |
| 7 | Permissions, middleware guards, action wrappers | `src/lib/permissions.ts`, `src/lib/errors.ts`, `src/lib/actions.ts`, `src/lib/middleware/*`, `src/middleware.ts`, `src/actions/index.ts` |
| 8 | Design tokens, fonts, and layout shell | `global.css`, layout components |
| 9 | UI primitives and client scripts | `src/components/ui/*`, `src/scripts/*` |
| 10 | Pages: home placeholder, login, errors, admin dashboard shell | `src/pages/*` |
| 11 | E2E harness and auth-gating scenarios | `playwright.config.ts`, `tests/e2e/*` |

<!-- TASK BODIES BELOW ARE ASSEMBLED FROM THE DRAFT+VERIFY WORKFLOW -->
