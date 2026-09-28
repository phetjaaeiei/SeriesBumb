import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getConfig } from '../config/config';
import { robotsTxt } from '../lib/robots';

export const GET: APIRoute = () => new Response(robotsTxt(getConfig(env).appEnv), {
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
});
