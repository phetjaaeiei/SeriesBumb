import { env } from 'cloudflare:workers';
import type { MiddlewareHandler } from 'astro';
import { adminSessionExpired } from '../../domain/admin-session';
import { getAuth } from '../../auth/auth';
import type { SessionUser } from '../../domain/types';

export const loadSession: MiddlewareHandler = async (context, next) => {
  context.locals.user = null;
  context.locals.session = null;
  try {
    const current = await getAuth().api.getSession({ headers: context.request.headers });
    if (current?.user && current.session) {
      const row = await env.DB.prepare('SELECT id, name, email, image, role, commentBanned FROM user WHERE id = ?').bind(current.user.id).first<Omit<SessionUser, 'commentBanned'> & { commentBanned: number }>();
      const createdAt = new Date(current.session.createdAt);
      if (row?.role === 'admin' && adminSessionExpired(createdAt, Date.now())) {
        // Admin sessions end 12 hours after sign-in; the next admin page sends them to /login.
        await env.DB.prepare('DELETE FROM session WHERE id = ?').bind(current.session.id).run();
      } else if (row) {
        context.locals.user = { ...row, commentBanned: Boolean(row.commentBanned) };
        context.locals.session = { id: current.session.id, expiresAt: new Date(current.session.expiresAt), createdAt };
      }
    }
  } catch (error) {
    // A D1 failure should not break public browsing or expose a stale role.
    console.error('Unable to load session', error instanceof Error ? error.message : 'unknown');
  }
  return next();
};
