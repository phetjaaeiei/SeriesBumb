import type { MiddlewareHandler } from 'astro';
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
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
