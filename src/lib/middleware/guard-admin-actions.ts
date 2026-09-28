import type { MiddlewareHandler } from 'astro';
import { adminActionNameFrom } from '../services/audit';

/** Rejects non-admin calls to admin actions, whether dispatched by RPC or by `?_action=` form POST. */
export const guardAdminActions: MiddlewareHandler = async (context, next) => {
  const rpc = context.url.pathname.startsWith('/_actions/');
  if (!adminActionNameFrom(context.url) || (!rpc && context.request.method !== 'POST')) return next();
  const code = !context.locals.user ? 'UNAUTHORIZED' : context.locals.user.role !== 'admin' ? 'FORBIDDEN' : null;
  if (!code) return next();
  return Response.json({ error: { code, message: code === 'UNAUTHORIZED' ? 'กรุณาเข้าสู่ระบบ' : 'หน้านี้สำหรับแอดมิน' } }, { status: code === 'UNAUTHORIZED' ? 401 : 403 });
};
