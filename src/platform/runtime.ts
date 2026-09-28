// The only module that reads Cloudflare's runtime (Phase 4 adds worker.ts). Moving to another host
// means reimplementing these getters; pages, components, actions and services never see bindings.
import { env, waitUntil } from 'cloudflare:workers';
import { getConfig, type AppConfig } from '../config/config';
import type { AudioEnvironment } from '../storage/audio-store';
import { supabaseImageStore, type SupabaseImageStore } from '../storage/supabase-image-store';

export const db = (): D1Database => env.DB;
export const config = (): AppConfig => getConfig(env);
/** Public image origin, or '' when images are not configured. */
export const imageBaseUrl = (): string => config().images.baseUrl ?? '';
export const imageStore = (): SupabaseImageStore => supabaseImageStore(env);
export const audioEnvironment = (): AudioEnvironment => env;
export const rateLimiters = () => ({ auth: env.AUTH_RATE_LIMITER, write: env.WRITE_RATE_LIMITER });
/** Keeps the request alive for work that must finish after the response (search reindex, cleanup). */
export const background = (task: Promise<unknown>): void => waitUntil(task);
