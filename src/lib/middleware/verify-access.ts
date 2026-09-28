import type { MiddlewareHandler } from 'astro';
import { env } from 'cloudflare:workers';
import { getConfig } from '../../config/config';
import { fetchAccessJwks, verifyAccessJwt } from '../access-jwt';
import { isAdminSurface } from '../admin-surface';

/**
 * Defense in depth once Cloudflare Access protects the admin surface: the edge JWT must be valid
 * and belong to the same person as the app session. Off until ACCESS_TEAM_DOMAIN and ACCESS_AUD are set.
 */
export const verifyAccess: MiddlewareHandler = async (context, next) => {
  const access = getConfig(env).access;
  if (!access || !isAdminSurface(context.url) || !context.locals.user) return next();
  const verified = await verifyAccessJwt(context.request.headers.get('Cf-Access-Jwt-Assertion'), {
    teamDomain: access.teamDomain,
    audience: access.audience,
    jwks: () => fetchAccessJwks(access.teamDomain),
  });
  if (verified && verified.email === context.locals.user.email.toLowerCase()) return next();
  return Response.json({ error: 'ต้องผ่าน Cloudflare Access ด้วยบัญชีเดียวกับที่เข้าสู่ระบบ' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
};
