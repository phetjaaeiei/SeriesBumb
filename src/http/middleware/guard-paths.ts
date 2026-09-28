import { config } from '../../platform/runtime';
import type { MiddlewareHandler } from 'astro';
import { safeNextPath } from '../../domain/urls';

export const guardPaths: MiddlewareHandler = async (context, next) => {
  const path = context.url.pathname;
  const privatePath = path === '/me' || path.startsWith('/me/') || path === '/admin' || path.startsWith('/admin/');
  if (!privatePath) return next();
  if (path.startsWith('/admin/api/')) {
    if (!context.locals.user || !context.locals.session) {
      return Response.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
    }
    if (context.locals.user.role !== 'admin') {
      return Response.json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
    }
  }
  if (!context.locals.user) {
    const wanted = safeNextPath(path + context.url.search, config().siteUrl);
    return context.redirect(`/login?next=${encodeURIComponent(wanted)}`, 302);
  }
  if ((path === '/admin' || path.startsWith('/admin/')) && context.locals.user.role !== 'admin') {
    return context.rewrite('/403');
  }
  return next();
};
