import { z } from 'astro/zod';

// Empty strings in wrangler vars mean "not configured".
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
  SUPABASE_IMAGE_SECRET_KEY: optionalText,
  SUPABASE_AUDIO_SECRET_KEY: optionalText,
  SUPABASE_IMAGE_BUCKET: optionalText,
  SUPABASE_AUDIO_BUCKET: optionalText,
  SUPABASE_IMAGE_UPLOADS_ENABLED: flag,
  AUDIO_FIREBASE_ENABLED: flag,
  CF_BEACON_TOKEN: optionalText,
});

export type ParsedEnv = z.output<typeof envSchema>;
