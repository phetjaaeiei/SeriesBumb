import type { MiddlewareHandler } from 'astro';
import { env } from 'cloudflare:workers';
import { getConfig, isProduction } from '../../config/config';
import { isD1QuotaError } from '../errors';

export const securityHeaders: MiddlewareHandler = async (context, next) => {
  let response: Response;
  try {
    response = await next();
  } catch (error) {
    if (!isD1QuotaError(error)) throw error;
    response = await context.rewrite('/503');
  }
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (context.url.pathname === '/admin' || context.url.pathname.startsWith('/admin/')) {
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  // Staging and local builds must never be indexed or compete with production URLs.
  if (!isProduction(getConfig(env))) headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
