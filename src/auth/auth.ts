import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { env } from 'cloudflare:workers';
import { betterAuth } from 'better-auth';
import { sql } from 'drizzle-orm';
import { getConfig } from '../config/config';
import { getDb, jsonParam, type Db } from '../db/client';
import * as schema from '../db/schema';
import { parseAdminEmails } from '../domain/admin-emails';

export interface AuthEnv {
  SITE_URL: string;
  BETTER_AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ADMIN_EMAILS?: string;
}

export async function promoteAdmins(db: Db, userId: string, adminEmails: Set<string>): Promise<void> {
  if (adminEmails.size === 0) return;
  await db.run(sql`
    UPDATE user SET role = 'admin'
    WHERE id = ${userId}
      AND emailVerified = 1
      AND lower(email) IN (SELECT value FROM json_each(${jsonParam([...adminEmails])}))
      AND role <> 'admin'
  `);
}

/** Self-heals rows written by an older Worker version during a deploy window; no-op once clean. */
export async function clearProviderTokens(db: Db, userId: string): Promise<void> {
  await db.run(sql`
    UPDATE account
    SET accessToken = NULL, refreshToken = NULL, idToken = NULL, accessTokenExpiresAt = NULL, refreshTokenExpiresAt = NULL
    WHERE userId = ${userId}
      AND (accessToken IS NOT NULL OR refreshToken IS NOT NULL OR idToken IS NOT NULL)
  `);
}

export async function bumpUserCount(db: Db): Promise<void> {
  await db.run(sql`
    UPDATE site_stats
    SET userCount = userCount + 1, updatedAt = ${Date.now()}
    WHERE id = 1
  `);
}

const NO_PROVIDER_TOKENS = { accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null };

export function createAuth(d1: D1Database, authEnv: AuthEnv) {
  const db = getDb(d1);
  const adminEmails = parseAdminEmails(authEnv.ADMIN_EMAILS);

  return betterAuth({
    baseURL: authEnv.SITE_URL,
    secret: authEnv.BETTER_AUTH_SECRET,
    trustedOrigins: [authEnv.SITE_URL],
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    socialProviders: {
      google: {
        clientId: authEnv.GOOGLE_CLIENT_ID,
        clientSecret: authEnv.GOOGLE_CLIENT_SECRET,
        prompt: 'select_account',
        overrideUserInfoOnSignIn: false,
      },
    },
    user: {
      additionalFields: {
        role: { type: 'string', required: true, defaultValue: 'member', input: false },
        commentBanned: { type: 'boolean', required: true, defaultValue: false, input: false },
      },
    },
    disabledPaths: ['/update-user'],
    // OAuth state lives in an encrypted cookie so an anonymous sign-in attempt writes nothing to D1.
    account: { storeStateStrategy: 'cookie', updateAccountOnSignIn: false },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    // /api/auth/error is not exposed (see auth-routes.ts); failed callbacks land on our login page.
    onAPIError: { errorURL: `${authEnv.SITE_URL}/login?error=1` },
    databaseHooks: {
      // The site only uses Google for identity, so provider tokens are never kept.
      account: {
        create: { before: async (account) => ({ data: { ...account, ...NO_PROVIDER_TOKENS } }) },
        update: { before: async (account) => ({ data: { ...account, accessToken: null, refreshToken: null, idToken: null } }) },
      },
      session: {
        create: {
          after: async (session) => {
            await promoteAdmins(db, session.userId, adminEmails);
            await clearProviderTokens(db, session.userId);
          },
        },
      },
      user: {
        create: {
          after: async () => {
            await bumpUserCount(db);
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

let cachedAuth: Auth | undefined;

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
