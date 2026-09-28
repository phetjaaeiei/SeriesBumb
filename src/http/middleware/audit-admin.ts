import type { MiddlewareHandler } from 'astro';
import { env } from 'cloudflare:workers';
import { auditApiActionFor, auditTargetFromPath, recordAudit } from '../../services/audit';

/**
 * Records writes to the admin REST API (`/admin/api/*`) after they run. Admin actions are
 * audited in `runAdminAction` instead. The target comes from the path; bodies are never read.
 */
export const auditAdmin: MiddlewareHandler = async (context, next) => {
  const action = auditApiActionFor(context.request.method, context.url.pathname);
  const user = context.locals.user;
  if (!action || !user || user.role !== 'admin') return next();
  const response = await next();
  try {
    await recordAudit(env.DB, {
      actorUserId: user.id,
      actorEmail: user.email,
      action,
      targetId: auditTargetFromPath(context.url.pathname),
      status: response.status,
    });
  } catch (error) {
    // Auditing must never break the admin write it describes.
    console.error('Unable to record admin audit', error instanceof Error ? error.name : 'unknown');
  }
  return response;
};
