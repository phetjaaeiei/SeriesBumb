import { ActionError } from 'astro:actions';
import { REAUTH_MESSAGE, isFreshSession } from '../domain/admin-session';
import type { SessionUser } from '../domain/types';
export { parseAdminEmails } from '../domain/admin-emails';

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === 'admin';
}

export function requireUser(locals: App.Locals): SessionUser {
  if (!locals.user) throw new ActionError({ code: 'UNAUTHORIZED' });
  return locals.user;
}

export function requireAdmin(locals: App.Locals): SessionUser {
  const user = requireUser(locals);
  if (!isAdmin(user)) throw new ActionError({ code: 'FORBIDDEN' });
  return user;
}

/** Destructive admin actions need a sign-in from the last 15 minutes. */
export function requireFreshSession(locals: Pick<App.Locals, 'user' | 'session'>): void {
  if (!locals.user || !locals.session) throw new ActionError({ code: 'UNAUTHORIZED' });
  if (!isFreshSession(locals.session.createdAt, Date.now())) throw new ActionError({ code: 'FORBIDDEN', message: REAUTH_MESSAGE });
}

export function canComment(user: SessionUser | null): boolean {
  return user !== null && !user.commentBanned;
}
