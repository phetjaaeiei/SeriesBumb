import { sequence } from 'astro:middleware';
import { securityHeaders } from './lib/middleware/security-headers';
import { loadSession } from './lib/middleware/load-session';
import { guardPaths } from './lib/middleware/guard-paths';
import { guardAdminActions } from './lib/middleware/guard-admin-actions';
import { auditAdmin } from './lib/middleware/audit-admin';
import { redirectOn404 } from './lib/middleware/redirect-on-404';

export const onRequest = sequence(securityHeaders, loadSession, guardPaths, guardAdminActions, auditAdmin, redirectOn404);
