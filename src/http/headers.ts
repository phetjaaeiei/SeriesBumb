export interface HeaderInput {
  pathname: string;
  hasSessionCookie: boolean;
  production: boolean;
}

const PRIVATE_PATH = /^\/(?:me|admin)(?:\/|$)|^\/login$|^\/api\/auth\//u;
const ADMIN_PATH = /^\/admin(?:\/|$)/u;

/** Headers every SSR response gets. Cache-Control is only a floor for private responses. */
export function securityHeaderSet({ pathname, hasSessionCookie, production }: HeaderInput): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // 180 days, no preload yet: preload is hard to undo before a custom domain exists.
    'Strict-Transport-Security': 'max-age=15552000',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    // Google sign-in opens in the same tab today; allow-popups keeps a future popup flow working.
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    // Pages differ for signed-in visitors, so any shared cache must key on the cookie.
    Vary: 'Cookie',
  };
  if (hasSessionCookie || PRIVATE_PATH.test(pathname)) headers['Cache-Control'] = 'private, no-store';
  if (!production || ADMIN_PATH.test(pathname)) headers['X-Robots-Tag'] = 'noindex, nofollow';
  return headers;
}

const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/u;

export function hasSessionCookie(cookieHeader: string | null | undefined): boolean {
  return Boolean(cookieHeader && SESSION_COOKIE.test(cookieHeader));
}
