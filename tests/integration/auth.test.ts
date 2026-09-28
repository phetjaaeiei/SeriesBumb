import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { getDb } from '../../src/db/client';
import { bumpUserCount, createAuth, promoteAdmins } from '../../src/lib/auth';

const db = getDb(env.DB);
const now = Date.now();

describe('Better Auth bootstrap', () => {
  it('promotes only an email-verified user with an exact bootstrap email', async () => {
    const allowed = new Set(['admin@example.test', 'unverified@example.test']);
    const rows = [
      { id: crypto.randomUUID(), email: 'ADMIN@example.test', verified: 1 },
      { id: crypto.randomUUID(), email: 'unverified@example.test', verified: 0 },
      { id: crypto.randomUUID(), email: 'shop.admin@example.test', verified: 1 },
    ];
    for (const row of rows) {
      await env.DB.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(row.id, 'ทดสอบ', row.email, row.verified, now, now).run();
      await promoteAdmins(db, row.id, allowed);
    }

    const roles = await env.DB.prepare('SELECT id, role FROM user WHERE id IN (?, ?, ?)')
      .bind(...rows.map((row) => row.id)).all<{ id: string; role: string }>();
    expect(new Map(roles.results.map((row) => [row.id, row.role]))).toEqual(new Map([
      [rows[0].id, 'admin'],
      [rows[1].id, 'member'],
      [rows[2].id, 'member'],
    ]));

    await promoteAdmins(db, rows[0].id, new Set());
    expect((await env.DB.prepare('SELECT role FROM user WHERE id = ?').bind(rows[0].id).first<{ role: string }>())?.role).toBe('admin');
  });

  it('increments the precomputed user count', async () => {
    const before = await env.DB.prepare('SELECT userCount FROM site_stats WHERE id = 1').first<{ userCount: number }>();
    await bumpUserCount(db);
    const after = await env.DB.prepare('SELECT userCount, updatedAt FROM site_stats WHERE id = 1').first<{ userCount: number; updatedAt: number }>();
    expect(after?.userCount).toBe((before?.userCount ?? 0) + 1);
    expect(after?.updatedAt).toBeGreaterThan(0);
  });

  it('locks privileged user fields and disables the update-user endpoint', async () => {
    const auth = createAuth(env.DB, {
      SITE_URL: 'http://localhost:4321',
      BETTER_AUTH_SECRET: 'integration-test-secret-only',
      GOOGLE_CLIENT_ID: 'integration-test-client-id',
      GOOGLE_CLIENT_SECRET: 'integration-test-client-secret',
      ADMIN_EMAILS: 'admin@example.test',
    });

    expect(auth.options.user?.additionalFields?.role?.input).toBe(false);
    expect(auth.options.user?.additionalFields?.commentBanned?.input).toBe(false);
    expect(auth.options.disabledPaths).toContain('/update-user');
    expect(Object.hasOwn(auth.options, 'session')).toBe(false);

    const response = await auth.handler(new Request('http://localhost:4321/api/auth/update-user', {
      method: 'POST',
      headers: { origin: 'http://localhost:4321', 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    }));
    expect(response.status).toBe(404);
  });
});

describe('Google account storage', () => {
  const authEnv = {
    SITE_URL: 'http://localhost:4321',
    BETTER_AUTH_SECRET: 'integration-test-secret-only',
    GOOGLE_CLIENT_ID: 'integration-test-client-id',
    GOOGLE_CLIENT_SECRET: 'integration-test-client-secret',
  };

  it('keeps OAuth state in a cookie and never stores Google tokens', async () => {
    const auth = createAuth(env.DB, authEnv);
    expect(auth.options.account?.storeStateStrategy).toBe('cookie');
    const context = await auth.$context;
    const userId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)')
      .bind(userId, 'ทดสอบ', `${userId}@example.test`, now, now).run();
    const account = await context.internalAdapter.createAccount({
      userId,
      providerId: 'google',
      accountId: `google-${userId}`,
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      idToken: 'id-secret',
    });
    await context.internalAdapter.updateAccount(account.id, { accessToken: 'rotated-secret' });
    const row = await env.DB.prepare('SELECT accessToken, refreshToken, idToken FROM account WHERE id = ?').bind(account.id).first();
    expect(row).toEqual({ accessToken: null, refreshToken: null, idToken: null });
  });

  it('starts Google sign-in without writing a verification row', async () => {
    const auth = createAuth(env.DB, authEnv);
    const before = await env.DB.prepare('SELECT COUNT(*) AS n FROM verification').first<{ n: number }>();
    const response = await auth.handler(new Request('http://localhost:4321/api/auth/sign-in/social', {
      method: 'POST',
      headers: { origin: 'http://localhost:4321', 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'google', callbackURL: '/' }),
    }));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { url: string }).url).toContain('accounts.google.com');
    expect(response.headers.get('set-cookie')).toMatch(/state/iu);
    const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM verification').first<{ n: number }>();
    expect(after?.n).toBe(before?.n);
  });

  it('has no stored Google tokens after migrations', async () => {
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM account WHERE accessToken IS NOT NULL OR refreshToken IS NOT NULL OR idToken IS NOT NULL').first<{ n: number }>();
    expect(left?.n).toBe(0);
  });
});
