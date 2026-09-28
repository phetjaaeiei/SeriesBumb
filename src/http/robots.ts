import type { AppEnv } from '../config/config';

const PRODUCTION_RULES = `User-agent: facebookexternalhit
Allow: /

User-agent: *
Disallow: /search
Disallow: /partials/
Disallow: /admin
Disallow: /tapes?
Disallow: /genres/*?
Disallow: /decades/*?
Disallow: /labels/*?
`;

export function robotsTxt(appEnv: AppEnv): string {
  return appEnv === 'production' ? PRODUCTION_RULES : 'User-agent: *\nDisallow: /\n';
}
