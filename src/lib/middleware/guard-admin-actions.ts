import type { MiddlewareHandler } from 'astro';

export const guardAdminActions: MiddlewareHandler = async (context, next) => {
  if (!context.url.pathname.startsWith('/_actions/admin.')) return next();
  const code = !context.locals.user ? 'UNAUTHORIZED' : context.locals.user.role !== 'admin' ? 'FORBIDDEN' : null;
  if (!code) return next();
  return Response.json({ error: { code, message: code === 'UNAUTHORIZED' ? 'กรุณาเข้าสู่ระบบ' : 'หน้านี้สำหรับแอดมิน' } }, { status: code === 'UNAUTHORIZED' ? 401 : 403 });
};
