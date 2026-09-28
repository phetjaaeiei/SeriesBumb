# Free Demo Phase 1: Security Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the verified medium/low findings that are fixable in code for $0: open redirect, abusable auth/engagement writes, OAuth token storage, missing headers and cache controls, unvalidated image keys, single-layer admin page guard.

**Architecture:** Small pure helpers (`safeNextPath`, `isAllowedAuthPath`, `securityHeaderSet`, `assertEntityImageKey`, `redactBackupRow`) carry the logic and get unit tests; thin call sites wire them in. Rate limiting goes through a `RateLimiter` port backed by the Workers Rate Limiting binding (free, no D1 writes), with a no-op fallback when the binding is absent (local/tests).

**Tech Stack:** Astro 7.3.5, @astrojs/cloudflare 14.3.3, better-auth 1.7.6, Workers Rate Limiting binding (`ratelimits`), Vitest 4.1 + @cloudflare/vitest-plugin.

**Spec:** `docs/superpowers/specs/2026-09-28-seriesbumb-free-production-ready-design.md` §6 (Phase 1)

## Global Constraints

- $0/month; no new paid service.
- Behavior changes start with a failing test; `npm run lint`, `npm run check`, `npm test`, `npm run test:int` stay green.
- Never log secrets, tokens, emails or private filenames.
- UI/error copy is Thai.
- Migrations only via `npx drizzle-kit generate --custom --name <name>`; `npm run check:migrations` must pass.

---

### Task 1: Open-redirect hardening

**Files:** Modify `src/lib/urls.ts:1-13`, `src/lib/middleware/redirect-on-404.ts:12`; Test `tests/unit/urls.test.ts`

**Interfaces:** Produces `safeNextPath(next, siteUrl): string` (unchanged signature, stricter), `safeInternalPath(path: string): string | null`.

- [ ] **Step 1: Failing tests** (append to `tests/unit/urls.test.ts`)

```ts
describe('open redirect hardening', () => {
  const site = 'https://seriesbumb.phetjaa.workers.dev';
  it.each(['/.//evil.com', '/a/..//evil.com', `${site}//evil.com`, '/\\evil.com', '/%0d%0aLocation:evil'])('rejects %s', (next) => {
    expect(safeNextPath(next, site)).toBe('/');
  });
  it('keeps normal internal paths', () => {
    expect(safeNextPath('/tapes/abc?x=1#top', site)).toBe('/tapes/abc?x=1#top');
  });
  it('safeInternalPath refuses protocol-relative and backslash targets', () => {
    expect(safeInternalPath('//evil.example/x')).toBeNull();
    expect(safeInternalPath('/\\evil')).toBeNull();
    expect(safeInternalPath('/tapes/new-slug')).toBe('/tapes/new-slug');
  });
});
```

- [ ] **Step 2:** `npx vitest run --config vitest.config.ts tests/unit/urls.test.ts` → FAIL (`/.//evil.com` returns `//evil.com`; `safeInternalPath` missing).

- [ ] **Step 3: Implement** in `src/lib/urls.ts`

```ts
const UNSAFE_PATH = /^\/[/\\]|\\|[\u0000-\u001f\u007f]/u;

export function safeInternalPath(path: string): string | null {
  return path.startsWith('/') && !UNSAFE_PATH.test(path) ? path : null;
}

export function safeNextPath(next: string | null | undefined, siteUrl: string): string {
  if (!next) return '/';
  try {
    const base = new URL(siteUrl);
    const candidate = new URL(next, base);
    if (candidate.origin !== base.origin
      || candidate.pathname.startsWith('/login')
      || candidate.pathname.startsWith('/api/auth/')) return '/';
    const path = candidate.pathname + candidate.search + candidate.hash;
    return safeInternalPath(path) && !UNSAFE_PATH.test(decodeURIComponent(candidate.pathname)) ? path : '/';
  } catch {
    return '/';
  }
}
```

In `redirect-on-404.ts` only answer 301 when `safeInternalPath(result.toPath)` is non-null.

- [ ] **Step 4:** unit tests PASS; `npm test`.
- [ ] **Step 5:** commit `fix(security): refuse protocol-relative next and redirect targets`.

---

### Task 2: Auth surface — endpoint allowlist, cookie OAuth state, no stored Google tokens

**Files:** Create `src/lib/auth-routes.ts`, `tests/unit/auth-routes.test.ts`; Modify `src/pages/api/auth/[...all].ts`, `src/lib/auth.ts` (`createAuth` options, `databaseHooks.account`), add migration via `npx drizzle-kit generate --custom --name clear_oauth_tokens`; Test `tests/integration/auth.test.ts`

**Interfaces:** Produces `isAllowedAuthPath(method: string, pathname: string): boolean`.

- [ ] **Step 1: Failing unit test** `tests/unit/auth-routes.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { isAllowedAuthPath } from '../../src/lib/auth-routes';

describe('isAllowedAuthPath', () => {
  it.each([
    ['POST', '/api/auth/sign-in/social'],
    ['GET', '/api/auth/callback/google'],
    ['POST', '/api/auth/callback/google'],
    ['GET', '/api/auth/get-session'],
    ['POST', '/api/auth/sign-out'],
  ])('allows %s %s', (method, path) => expect(isAllowedAuthPath(method, path)).toBe(true));

  it.each([
    ['POST', '/api/auth/sign-up/email'],
    ['POST', '/api/auth/sign-in/email'],
    ['GET', '/api/auth/get-access-token'],
    ['POST', '/api/auth/link-social'],
    ['POST', '/api/auth/delete-user'],
    ['GET', '/api/auth/sign-in/social'],
    ['GET', '/api/auth/callback/github'],
  ])('blocks %s %s', (method, path) => expect(isAllowedAuthPath(method, path)).toBe(false));
});
```

- [ ] **Step 2:** run → FAIL (module missing).

- [ ] **Step 3: Implement** `src/lib/auth-routes.ts`

```ts
// The app only needs Google sign-in, its callback, session reads and sign-out.
// Everything else better-auth exposes stays unreachable even if a future upgrade enables it.
const ALLOWED: Record<string, readonly string[]> = {
  '/api/auth/sign-in/social': ['POST'],
  '/api/auth/callback/google': ['GET', 'POST'],
  '/api/auth/get-session': ['GET'],
  '/api/auth/sign-out': ['POST'],
};

export function isAllowedAuthPath(method: string, pathname: string): boolean {
  return ALLOWED[pathname]?.includes(method.toUpperCase()) ?? false;
}
```

`src/pages/api/auth/[...all].ts`:

```ts
import type { APIRoute } from 'astro';
import { getAuth } from '../../../lib/auth';
import { isAllowedAuthPath } from '../../../lib/auth-routes';

export const prerender = false;

const handle: APIRoute = ({ request, url }) => {
  if (!isAllowedAuthPath(request.method, url.pathname)) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return getAuth().handler(request);
};
export const GET = handle;
export const POST = handle;
```

In `createAuth` add:

```ts
    account: { storeStateStrategy: 'cookie', updateAccountOnSignIn: false },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
```

and in `databaseHooks`:

```ts
      account: {
        create: { before: async (account) => ({ data: { ...account, accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null } }) },
        update: { before: async (account) => ({ data: { ...account, accessToken: null, refreshToken: null, idToken: null } }) },
      },
```

Migration (`npx drizzle-kit generate --custom --name clear_oauth_tokens`) body:

```sql
UPDATE `account` SET `accessToken` = NULL, `refreshToken` = NULL, `idToken` = NULL, `accessTokenExpiresAt` = NULL, `refreshTokenExpiresAt` = NULL;
```

- [ ] **Step 4: Integration test** (append to `tests/integration/auth.test.ts`): creating an account through `auth.$context` adapter stores null tokens; the migration leaves no non-null tokens. Run `npm run test:int` → PASS; `npm run check:migrations` → ✓.
- [ ] **Step 5:** commit `fix(auth): allowlist auth endpoints, keep OAuth state in a cookie, drop Google tokens`.

---

### Task 3: Rate limiting port

**Files:** Create `src/lib/rate-limit.ts`, `tests/unit/rate-limit.test.ts`; Modify `wrangler.jsonc` (`ratelimits` top-level and in `env.staging`), `worker-configuration.d.ts` (`npm run types`), `vitest.integration.config.ts` (miniflare `ratelimits`), `src/pages/api/auth/[...all].ts`, `src/actions/index.ts` (engagement, comments.create, reviews.*)

**Interfaces:**
- `interface RateLimiter { allow(key: string): Promise<boolean> }`
- `rateLimiter(binding: RateLimit | undefined): RateLimiter` (no binding → always allow)
- `class RateLimitedError` → mapped to `ActionError({ code: 'TOO_MANY_REQUESTS', message: 'ทำรายการถี่เกินไป กรุณารอสักครู่' })`
- Bindings: `AUTH_RATE_LIMITER` (10 req / 60 s per IP), `WRITE_RATE_LIMITER` (30 req / 60 s per user)

- [ ] **Step 1: Failing unit test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { rateLimiter } from '../../src/lib/rate-limit';

describe('rateLimiter', () => {
  it('allows everything when the binding is missing', async () => {
    expect(await rateLimiter(undefined).allow('k')).toBe(true);
  });
  it('asks the binding with the given key', async () => {
    const limit = vi.fn().mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false });
    const limiter = rateLimiter({ limit } as unknown as RateLimit);
    expect(await limiter.allow('user:1')).toBe(true);
    expect(await limiter.allow('user:1')).toBe(false);
    expect(limit).toHaveBeenCalledWith({ key: 'user:1' });
  });
  it('fails open when the binding throws', async () => {
    const limiter = rateLimiter({ limit: vi.fn().mockRejectedValue(new Error('boom')) } as unknown as RateLimit);
    expect(await limiter.allow('k')).toBe(true);
  });
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** `src/lib/rate-limit.ts`

```ts
export interface RateLimiter { allow(key: string): Promise<boolean> }

export class RateLimitedError extends Error {
  constructor() { super('ทำรายการถี่เกินไป กรุณารอสักครู่'); this.name = 'RateLimitedError'; }
}

export function rateLimiter(binding: RateLimit | undefined): RateLimiter {
  return {
    async allow(key) {
      if (!binding) return true;
      try { return (await binding.limit({ key })).success; }
      catch { return true; } // The limiter protects quotas; an outage must not lock members out.
    },
  };
}
```

`wrangler.jsonc` top level and `env.staging`:

```jsonc
  "ratelimits": [
    { "name": "AUTH_RATE_LIMITER", "namespace_id": "1001", "simple": { "limit": 10, "period": 60 } },
    { "name": "WRITE_RATE_LIMITER", "namespace_id": "1002", "simple": { "limit": 30, "period": 60 } }
  ],
```

(staging uses namespace ids `2001`/`2002`). Run `npm run types`. Wire: auth route → before `getAuth().handler` for `POST /api/auth/sign-in/social`, key `auth:${request.headers.get('cf-connecting-ip') ?? 'unknown'}`, respond `429` Thai JSON when denied. Actions → a helper `limitWrite(userId)` that throws `ActionError TOO_MANY_REQUESTS` used by `engagement.*`, `comments.create`, `reviews.submit`, `reviews.correct`.

- [ ] **Step 4:** unit + integration green; staging deploy confirms the binding is accepted on the Free plan (if wrangler rejects `ratelimits`, remove the bindings and keep the port — the no-op path is already tested).
- [ ] **Step 5:** commit `feat(security): rate limit sign-in and member writes without D1 writes`.

---

### Task 4: Engagement write amplification

**Files:** Modify `src/lib/services/engagement.ts:9-23`; Test `tests/integration/engagement.test.ts`

- [ ] **Step 1: Failing integration test** — liking twice leaves `likeCount = 1`; unliking an unliked tape leaves `0`; and the second identical call reports `meta.rows_written` of the counter statement as 0 (assert via `result.changed === false`).
- [ ] **Step 2:** run → FAIL (`changed` missing).
- [ ] **Step 3: Implement** — run the write first; only when `meta.changes > 0` run `UPDATE <target> SET <count> = <count> ± 1` (never below 0) and return `{ value, count, changed: true }`; otherwise read the current count and return `changed: false`.

```ts
  const writeResult = await write.run();
  const changed = (writeResult.meta.changes ?? 0) > 0;
  if (changed) {
    await db.prepare(`UPDATE ${targetTable} SET ${countColumn} = MAX(0, ${countColumn} ${value ? '+' : '-'} 1) WHERE id = ?`).bind(targetId).run();
  }
  const row = await db.prepare(`SELECT ${countColumn} AS count FROM ${targetTable} WHERE id = ?`).bind(targetId).first<{ count: number }>();
  return { value, count: row?.count ?? 0, changed };
```

- [ ] **Step 4:** `npm run test:int` PASS. **Step 5:** commit `perf(engagement): skip counter writes when nothing changed`.

---

### Task 5: Security headers and cache policy

**Files:** Create `src/lib/http-headers.ts`, `tests/unit/http-headers.test.ts`, `public/_headers`; Modify `src/lib/middleware/security-headers.ts`, `astro.config.mjs` (CSP directives)

**Interfaces:** `securityHeaderSet(input: { pathname: string; hasSessionCookie: boolean; production: boolean }): Record<string, string>`

- [ ] **Step 1: Failing unit test**

```ts
import { describe, expect, it } from 'vitest';
import { securityHeaderSet } from '../../src/lib/http-headers';

describe('securityHeaderSet', () => {
  it('sets the baseline headers on public pages', () => {
    const h = securityHeaderSet({ pathname: '/tapes', hasSessionCookie: false, production: true });
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Strict-Transport-Security']).toBe('max-age=15552000');
    expect(h['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin-allow-popups');
    expect(h['Cache-Control']).toBeUndefined();
    expect(h.Vary).toBe('Cookie');
  });
  it.each(['/me', '/me/submissions', '/login', '/admin', '/admin/tapes', '/api/auth/get-session'])('marks %s private', (pathname) => {
    expect(securityHeaderSet({ pathname, hasSessionCookie: false, production: true })['Cache-Control']).toBe('private, no-store');
  });
  it('marks any response for a signed-in visitor private', () => {
    expect(securityHeaderSet({ pathname: '/tapes', hasSessionCookie: true, production: true })['Cache-Control']).toBe('private, no-store');
  });
  it('noindexes admin and non-production', () => {
    expect(securityHeaderSet({ pathname: '/admin', hasSessionCookie: false, production: true })['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(securityHeaderSet({ pathname: '/', hasSessionCookie: false, production: false })['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(securityHeaderSet({ pathname: '/', hasSessionCookie: false, production: true })['X-Robots-Tag']).toBeUndefined();
  });
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** `src/lib/http-headers.ts` returning the map above (HSTS 180 days without preload; private paths: `/me*`, `/login`, `/admin*`, `/api/auth/*`); the middleware detects a session cookie with `/(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/` and applies every header (only sets `Cache-Control` when the route did not set one). CSP in `astro.config.mjs` adds `"form-action 'self'"` and `"frame-ancestors 'none'"`. `public/_headers`:

```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
```

- [ ] **Step 4:** unit PASS; `npm run build` and confirm `dist/client/_headers` contains both the `/*` block and the adapter's `/_astro/*` block; e2e smoke still green.
- [ ] **Step 5:** commit `fix(security): add HSTS, permissions and opener policies and private caching`.

---

### Task 6: Admin page guard and image key ownership

**Files:** Modify `src/components/layout/AdminLayout.astro`, `src/lib/services/catalog.ts` (`saveArtist`, `saveLabel`, `saveCollection`); Create `src/lib/services/image-keys.ts`, `tests/unit/image-keys.test.ts`; Test `tests/integration/catalog-write.test.ts`

**Interfaces:** `assertEntityImageKey(entity: 'artists' | 'labels' | 'collections', entityId: string, key: string | null | undefined): string | null` — returns the key or null, throws `CatalogError('รูปนี้ไม่ใช่ของรายการนี้')` otherwise.

- [ ] **Step 1: Failing unit test**

```ts
import { describe, expect, it } from 'vitest';
import { assertEntityImageKey } from '../../src/lib/services/image-keys';

const id = '11111111-1111-4111-8111-111111111111';
const uuid = '22222222-2222-4222-8222-222222222222';

describe('assertEntityImageKey', () => {
  it('accepts full and thumb keys under the entity folder', () => {
    expect(assertEntityImageKey('artists', id, `artists/${id}/${uuid}-full.webp`)).toBe(`artists/${id}/${uuid}-full.webp`);
    expect(assertEntityImageKey('labels', id, `labels/${id}/${uuid}-thumb.jpg`)).toBe(`labels/${id}/${uuid}-thumb.jpg`);
  });
  it('treats empty as no image', () => {
    expect(assertEntityImageKey('collections', id, '')).toBeNull();
    expect(assertEntityImageKey('collections', id, null)).toBeNull();
  });
  it.each([
    `tapes/${id}/${uuid}-full.jpg`,
    `artists/33333333-3333-4333-8333-333333333333/${uuid}-full.jpg`,
    `artists/${id}/../x-full.jpg`,
    `artists/${id}/${uuid}-og.jpg`,
  ])('rejects %s', (key) => {
    expect(() => assertEntityImageKey('artists', id, key)).toThrow('รูปนี้ไม่ใช่ของรายการนี้');
  });
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** with `new RegExp(`^${entity}/${id}/[0-9a-f-]{36}-(full|thumb)\\.(jpg|webp)$`, 'u')` after asserting `id` is a UUID; call it in the three save functions before the UPDATE. `AdminLayout.astro`: `if (Astro.locals.user?.role !== 'admin') return Astro.rewrite('/403');` above the markup.
- [ ] **Step 4:** unit + integration green (add a `saveArtist` test that rejects another tape's key).
- [ ] **Step 5:** commit `fix(security): bind entity image keys to their owner and re-check admin role in layout`.

---

### Task 7: Backups without sessions or tokens

**Files:** Modify `scripts/d1-common.ts:66-74` (skip `session`, `verification`), `scripts/backup.ts` (redact rows); Create `scripts/lib/backup-redaction.ts`, `tests/unit/backup-redaction.test.ts`

**Interfaces:** `BACKUP_EXCLUDED_TABLES: readonly string[]`, `redactBackupRow(table: string, row: Record<string, unknown>): Record<string, unknown>`

- [ ] **Step 1: Failing test** — `redactBackupRow('account', { id: 'a', accessToken: 't', refreshToken: 'r', idToken: 'i', providerId: 'google' })` returns tokens as `null`, keeps `providerId`; other tables returned unchanged; `BACKUP_EXCLUDED_TABLES` equals `['session', 'verification']`.
- [ ] **Step 2:** FAIL. **Step 3:** implement and use in `backup.ts` before writing chunks; `tableSchemas` filters excluded tables; `restore.ts` tolerates their absence (tables exist from migrations, just empty).
- [ ] **Step 4:** unit green; `node --experimental-strip-types scripts/backup.ts --help` still parses. **Step 5:** commit `fix(backup): leave sessions, verification rows and OAuth tokens out of exports`.

---

### Task 8: Ship Phase 1

- [ ] Rebase onto `origin/main` after Phase 0 merges (`git rebase --onto origin/main feat/free-demo-phase0`), rerun all checks, push, open PR, wait for CI.
- [ ] Merge, `npm run deploy:staging`, verify: `/login?next=/.//evil.com` while signed in stays on-site; `POST /api/auth/sign-up/email` → 404; 11 rapid `POST /api/auth/sign-in/social` → last one 429; headers present; e2e green.
- [ ] `npm run deploy:prod` (applies the token-clearing migration after a bookmark), e2e green.
