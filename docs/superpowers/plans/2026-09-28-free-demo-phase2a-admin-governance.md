# Free Demo Phase 2a: Admin Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make admin power accountable and harder to abuse with a stolen or stale session: only bootstrap owners change roles, every admin write is recorded, admin sessions expire after 12 hours and destructive actions need a sign-in from the last 15 minutes.

**Architecture:** Pure policy helpers (`canManageRoles`, `adminSessionPolicy`, `auditTargetFrom`) with unit tests; an `audit_log` table written by one middleware that wraps every admin action and admin API write; `loadSession` exposes `session.createdAt` and revokes admin sessions past 12 hours; a `requireFreshSession` guard on destructive actions.

**Tech Stack:** Astro 7.3.5 middleware + Actions, D1 via Drizzle schema + `npm run db:generate`, better-auth 1.7.6 session data.

**Spec:** `docs/superpowers/specs/2026-09-28-seriesbumb-free-production-ready-design.md` §6 (Phase 2 items 1–3). Items 4–5 (Access JWT, Turnstile) ship in Phase 2b.

## Global Constraints

- $0/month; every audit write is a single row (plus indexes) per admin write — never on reads.
- Audit rows store actor id + email, action name, target id, HTTP status and time only: no request bodies, IPs or user agents (PDPA data minimisation).
- UI/error copy is Thai. Tests first.

---

### Task 1: Only bootstrap owners change admin roles
**Files:** `src/lib/services/admin-community.ts`, `src/actions/index.ts:120`, `src/pages/admin/users.astro`, `src/components/admin/CommunityTables.tsx`; Test `tests/integration/admin-community.test.ts`
**Interfaces:** `setUserRole(db, actor: { id: string; email: string }, targetId, role, bootstrapEmails: string)`; `canManageRoles(email: string, bootstrapEmails: string): boolean`.
- [ ] Failing test: a promoted (non-bootstrap) admin gets `CommentError('เฉพาะแอดมินตั้งต้นเท่านั้นที่เปลี่ยนสิทธิ์แอดมินได้')` for promote and demote; the bootstrap owner still succeeds; existing self/bootstrap protections unchanged.
- [ ] Implement; users page hides role buttons unless `canManageRoles(locals.user.email, ADMIN_EMAILS)`.
- [ ] Commit `fix(admin): only bootstrap owners can grant or remove admin`.

### Task 2: Audit log
**Files:** `src/db/schema.ts` (`auditLog`), migration via `npm run db:generate`, `src/lib/services/audit.ts`, `src/lib/middleware/audit-admin.ts`, `src/middleware.ts`, `src/pages/admin/audit.astro`, `src/components/layout/AdminNav.astro`; Tests `tests/unit/audit.test.ts`, `tests/integration/audit.test.ts`
**Interfaces:** table `audit_log(id, actorUserId → user SET NULL, actorEmail, action, targetId, status, createdAt)` + indexes `(createdAt, id)` and `(actorUserId, createdAt)`; `auditActionFor(method, pathname): string | null`; `auditTargetFrom(body: unknown, pathname: string): string | null`; `recordAudit(db, entry)`; `listAudit(db, cursor)`.
- [ ] Failing unit tests: `auditActionFor('POST', '/_actions/admin.tapes.save')` → `admin.tapes.save`; reads (`admin.lookup`, `admin.health`, any GET) → null; `DELETE /admin/api/audio/<id>` → `DELETE /admin/api/audio`; `auditTargetFrom({ id: 'x' })` → `x`, falls back to `tapeId`, `songId`, `userId`, `artistId`, `memberId`, `targetId`, or the UUID in the path.
- [ ] Failing integration test: `recordAudit` then `listAudit` returns newest first with cursor.
- [ ] Implement middleware after `guardAdminActions` (only admins reach it): clone JSON bodies (≤ 64 KB) before `next()`, record after the response with its status; failures to record are logged by name only and never break the request.
- [ ] `/admin/audit` read-only table, 50 per page, noindex, linked from AdminNav.
- [ ] Commit `feat(admin): record every admin write in an audit log`.

### Task 3: Admin session lifetime and fresh sign-in for destructive actions
**Files:** `src/env.d.ts`, `src/lib/middleware/load-session.ts`, `src/lib/admin-session.ts`, `src/lib/permissions.ts`, `src/actions/index.ts` (deleteCatalog, users.setRole, users.setCommentBan, images.deleteTapeImage), `src/pages/admin/api/audio/[id]/index.ts` (DELETE), `src/pages/login.astro` + `src/scripts/login.ts` (`?reauth=1`); Tests `tests/unit/admin-session.test.ts`
**Interfaces:** `ADMIN_SESSION_MAX_AGE_MS = 12h`, `FRESH_SESSION_MS = 15min`; `adminSessionExpired(createdAt: Date, now: number): boolean`; `isFreshSession(createdAt: Date, now: number): boolean`; `requireFreshSession(locals)` throws `ActionError FORBIDDEN 'กรุณาเข้าสู่ระบบใหม่เพื่อยืนยันตัวตนก่อนทำรายการนี้'`.
- [ ] Failing unit tests for both policy functions at the boundaries.
- [ ] `loadSession`: set `locals.session.createdAt`; when `role === 'admin'` and expired, delete that session row and continue as a guest (next admin page → login).
- [ ] Destructive actions call `requireFreshSession`; audio DELETE returns 403 JSON with the same message; `/login?reauth=1` shows the Google button even while signed in.
- [ ] Commit `fix(admin): cap admin sessions at 12 hours and require a fresh sign-in to delete`.

### Task 4: Ship Phase 2a
- [ ] Full checks, adversarial diff review workflow, PR, CI, merge, staging deploy (migration), e2e, prod deploy, e2e.
