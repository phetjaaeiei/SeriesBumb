import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getAuth } from '../../../auth/auth';
import { isAllowedAuthPath } from '../../../auth/auth-routes';
import { getConfig, isProduction } from '../../../config/config';
import { RATE_LIMITED_MESSAGE, rateLimiter } from '../../../http/rate-limit';
import { TURNSTILE_FAILED_MESSAGE, verifyTurnstile } from '../../../http/turnstile';

export const prerender = false;

const noStore = { 'Cache-Control': 'no-store' };

const handle: APIRoute = async ({ request, url }) => {
  if (!isAllowedAuthPath(request.method, url.pathname)) return new Response('Not found', { status: 404, headers: noStore });
  if (url.pathname === '/api/auth/sign-in/social') {
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    if (!await rateLimiter(env.AUTH_RATE_LIMITER).allow(`sign-in:${ip}`)) {
      return Response.json({ message: RATE_LIMITED_MESSAGE }, { status: 429, headers: { ...noStore, 'Retry-After': '60' } });
    }
    const config = getConfig(env);
    if (config.turnstile && !await verifyTurnstile({
      secret: config.turnstile.secretKey,
      token: request.headers.get('x-turnstile-token'),
      ip: request.headers.get('cf-connecting-ip'),
      hostname: new URL(config.siteUrl).hostname,
      allowTestKeys: !isProduction(config),
    })) {
      return Response.json({ message: TURNSTILE_FAILED_MESSAGE }, { status: 403, headers: noStore });
    }
  }
  return getAuth().handler(request);
};

export const GET = handle;
export const POST = handle;
