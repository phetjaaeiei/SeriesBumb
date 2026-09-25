import { ActionError } from 'astro:actions';
import type { SessionUser } from './types';
export { parseAdminEmails } from './admin-emails';

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

export function canComment(user: SessionUser | null): boolean {
  return user !== null && !user.commentBanned;
}
