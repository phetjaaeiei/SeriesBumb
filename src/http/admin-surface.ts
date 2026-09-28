import { adminActionNameFrom } from '../services/audit';

/** Admin pages, the admin REST API, and admin actions however they are dispatched. */
export function isAdminSurface(url: URL): boolean {
  return /^\/admin(?:\/|$)/u.test(url.pathname) || adminActionNameFrom(url) !== null;
}
