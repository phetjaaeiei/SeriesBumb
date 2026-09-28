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
  access: { teamDomain: string; audience: string } | null;
  turnstile: { siteKey: string; secretKey: string } | null;
}

/** Lists invalid keys only; values may be secrets and must never reach logs. */
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

export function getConfig(env: object): AppConfig {
  const cached = cache.get(env);
  if (cached) return cached;
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError([...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? 'env')))].sort());
  }
  const e = parsed.data;
  const site = new URL(e.SITE_URL).origin;
  const config: AppConfig = {
    appEnv: e.APP_ENV,
    siteUrl: site,
    siteOrigin: site,
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
    access: e.ACCESS_TEAM_DOMAIN && e.ACCESS_AUD ? { teamDomain: new URL(e.ACCESS_TEAM_DOMAIN).origin, audience: e.ACCESS_AUD } : null,
    turnstile: e.TURNSTILE_SITE_KEY && e.TURNSTILE_SECRET_KEY ? { siteKey: e.TURNSTILE_SITE_KEY, secretKey: e.TURNSTILE_SECRET_KEY } : null,
  };
  cache.set(env, config);
  return config;
}

export function isProduction(config: AppConfig): boolean {
  return config.appEnv === 'production';
}
