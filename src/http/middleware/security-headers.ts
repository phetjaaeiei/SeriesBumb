import { config } from '../../platform/runtime';
import type { MiddlewareHandler } from 'astro';
import { isProduction } from '../../config/config';
import { isD1QuotaError } from '../../errors/d1';
import { hasSessionCookie, securityHeaderSet } from '../headers';

export const securityHeaders: MiddlewareHandler = async (context, next) => {
  let response: Response;
  try {
    response = await next();
  } catch (error) {
    if (!isD1QuotaError(error)) throw error;
    response = await context.rewrite('/503');
  }
  const headers = new Headers(response.headers);
  const extra = securityHeaderSet({
    pathname: context.url.pathname,
    hasSessionCookie: hasSessionCookie(context.request.headers.get('cookie')),
    production: isProduction(config()),
  });
  for (const [name, value] of Object.entries(extra)) {
    // Routes that already chose a stricter or explicit cache policy keep it.
    if (name === 'Cache-Control' && headers.has('Cache-Control')) continue;
    if (name === 'Vary') { headers.append('Vary', value); continue; }
    headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
