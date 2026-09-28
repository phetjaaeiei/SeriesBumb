import { sequence } from 'astro:middleware';
import { securityHeaders } from './http/middleware/security-headers';
import { loadSession } from './http/middleware/load-session';
import { guardPaths } from './http/middleware/guard-paths';
import { guardAdminActions } from './http/middleware/guard-admin-actions';
import { auditAdmin } from './http/middleware/audit-admin';
import { verifyAccess } from './http/middleware/verify-access';
import { redirectOn404 } from './http/middleware/redirect-on-404';

export const onRequest = sequence(securityHeaders, loadSession, guardPaths, guardAdminActions, verifyAccess, auditAdmin, redirectOn404);
