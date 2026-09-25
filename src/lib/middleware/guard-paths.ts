import { env } from 'cloudflare:workers';
import type { MiddlewareHandler } from 'astro';
import { safeNextPath } from '../urls';

export const guardPaths: MiddlewareHandler = async (context, next) => {
  const path = context.url.pathname;
  const privatePath = path === '/me' || path.startsWith('/me/') || path === '/admin' || path.startsWith('/admin/');
  if (!privatePath) return next();
  if (!context.locals.user) {
    const wanted = safeNextPath(path + context.url.search, env.SITE_URL);
    return context.redirect(`/login?next=${encodeURIComponent(wanted)}`, 302);
  }
  if ((path === '/admin' || path.startsWith('/admin/')) && context.locals.user.role !== 'admin') {
    return context.rewrite('/403');
  }
  return next();
};
