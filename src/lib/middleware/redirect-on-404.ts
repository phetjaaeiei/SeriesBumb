import { env } from 'cloudflare:workers';
import type { MiddlewareHandler } from 'astro';
import { normalizePath } from '../slug';

export const redirectOn404: MiddlewareHandler = async (context, next) => {
  const response = await next();
  if (response.status !== 404 || !['GET', 'HEAD'].includes(context.request.method)) return response;
  const path = normalizePath(context.url.pathname);
  if (!path) return response;
  try {
    const result = await env.DB.prepare('SELECT toPath FROM redirect WHERE fromPath = ?').bind(path).first<{ toPath: string }>();
    if (result?.toPath) return new Response(null, { status: 301, headers: { Location: encodeURI(result.toPath) } });
  } catch {
    // A missing local migration must not turn a normal 404 into a 500.
  }
  return response;
};
