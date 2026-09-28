// The app only needs Google sign-in, its callback, session reads and sign-out.
// Everything else better-auth exposes stays unreachable, even if a future upgrade enables it.
const ALLOWED: Record<string, readonly string[]> = {
  '/api/auth/sign-in/social': ['POST'],
  '/api/auth/callback/google': ['GET', 'POST'],
  '/api/auth/get-session': ['GET'],
  '/api/auth/sign-out': ['POST'],
};

export function isAllowedAuthPath(method: string, pathname: string): boolean {
  return ALLOWED[pathname]?.includes(method.toUpperCase()) ?? false;
}
