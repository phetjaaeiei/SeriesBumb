import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { env } from 'cloudflare:workers';
import { betterAuth } from 'better-auth';
import { sql } from 'drizzle-orm';
import { getDb, jsonParam, type Db } from '../db/client';
import * as schema from '../db/schema';
import { parseAdminEmails } from './admin-emails';

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

export async function bumpUserCount(db: Db): Promise<void> {
  await db.run(sql`
    UPDATE site_stats
    SET userCount = userCount + 1, updatedAt = ${Date.now()}
    WHERE id = 1
  `);
}

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
    databaseHooks: {
      session: {
        create: {
          after: async (session) => {
            await promoteAdmins(db, session.userId, adminEmails);
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
  cachedAuth ??= createAuth(env.DB, env);
  return cachedAuth;
}
