import type { MiddlewareHandler } from 'astro';
import { env } from 'cloudflare:workers';
import { auditActionFor, auditTargetFrom, recordAudit } from '../services/audit';

const MAX_AUDIT_BODY = 64 * 1024;

async function readJsonBody(request: Request): Promise<unknown> {
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return null;
  try {
    const text = await request.clone().text();
    return text.length <= MAX_AUDIT_BODY ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Records every admin write after it runs. Runs after the admin guards, so only admins reach it. */
export const auditAdmin: MiddlewareHandler = async (context, next) => {
  const action = auditActionFor(context.request.method, context.url.pathname);
  const user = context.locals.user;
  if (!action || !user || user.role !== 'admin') return next();
  const body = await readJsonBody(context.request);
  const response = await next();
  try {
    await recordAudit(env.DB, {
      actorUserId: user.id,
      actorEmail: user.email,
      action,
      targetId: auditTargetFrom(body, context.url.pathname),
      status: response.status,
    });
  } catch (error) {
    // Auditing must never break the admin write it describes.
    console.error('Unable to record admin audit', error instanceof Error ? error.name : 'unknown');
  }
  return response;
};
