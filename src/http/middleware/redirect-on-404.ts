import { db } from '../../platform/runtime';
import type { MiddlewareHandler } from 'astro';
import { normalizePath } from '../../domain/slug';
import { safeInternalPath } from '../../domain/urls';

export const redirectOn404: MiddlewareHandler = async (context, next) => {
  const response = await next();
  if (response.status !== 404 || !['GET', 'HEAD'].includes(context.request.method)) return response;
  const path = normalizePath(context.url.pathname);
  if (!path) return response;
  try {
    const result = await db().prepare('SELECT toPath FROM redirect WHERE fromPath = ?').bind(path).first<{ toPath: string }>();
    // Redirect rows come from slug changes, but never trust stored data to stay on-site.
    if (result?.toPath && safeInternalPath(result.toPath)) return new Response(null, { status: 301, headers: { Location: encodeURI(result.toPath) } });
  } catch {
    // A missing local migration must not turn a normal 404 into a 500.
  }
  return response;
};
