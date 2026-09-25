import { env } from 'cloudflare:workers';
import type { MiddlewareHandler } from 'astro';
import { getAuth } from '../auth';
import type { SessionUser } from '../types';

export const loadSession: MiddlewareHandler = async (context, next) => {
  context.locals.user = null;
  context.locals.session = null;
  try {
    const current = await getAuth().api.getSession({ headers: context.request.headers });
    if (current?.user && current.session) {
      const row = await env.DB.prepare('SELECT id, name, email, image, role, commentBanned FROM user WHERE id = ?').bind(current.user.id).first<Omit<SessionUser, 'commentBanned'> & { commentBanned: number }>();
      if (row) {
        context.locals.user = { ...row, commentBanned: Boolean(row.commentBanned) };
        context.locals.session = { id: current.session.id, expiresAt: new Date(current.session.expiresAt) };
      }
    }
  } catch (error) {
    // A D1 failure should not break public browsing or expose a stale role.
    console.error('Unable to load session', error instanceof Error ? error.message : 'unknown');
  }
  return next();
};
