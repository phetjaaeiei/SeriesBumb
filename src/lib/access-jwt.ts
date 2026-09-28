// Verifies the Cf-Access-Jwt-Assertion header Cloudflare Access adds in front of admin paths.
// https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/

export interface Jwks { keys: (JsonWebKey & { kid?: string })[] }

export interface AccessVerifyOptions {
  teamDomain: string;
  audience: string;
  now?: number;
  jwks: () => Promise<Jwks>;
}

const CLOCK_SKEW_SECONDS = 60;

function decodeSegment(segment: string): unknown {
  const base64 = segment.replace(/-/gu, '+').replace(/_/gu, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
}

function decodeBytes(segment: string): Uint8Array<ArrayBuffer> {
  const base64 = segment.replace(/-/gu, '+').replace(/_/gu, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Returns the verified email (lower-cased) or null. Never throws. */
export async function verifyAccessJwt(token: string | null | undefined, options: AccessVerifyOptions): Promise<{ email: string } | null> {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = decodeSegment(parts[0]) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || !header.kid) return null;
    const jwk = (await options.jwks()).keys.find((key) => key.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', { ...jwk, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!ok) return null;
    const claims = decodeSegment(parts[1]) as { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; email?: string };
    const nowSeconds = (options.now ?? Date.now()) / 1000;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== options.teamDomain || !audiences.includes(options.audience)) return null;
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS <= nowSeconds) return null;
    if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_SECONDS > nowSeconds) return null;
    if (typeof claims.email !== 'string' || !claims.email.includes('@')) return null;
    return { email: claims.email.trim().toLowerCase() };
  } catch {
    return null;
  }
}

let cachedJwks: { url: string; value: Jwks; expires: number } | null = null;

/** Fetches the team's signing keys, cached for 10 minutes per isolate. */
export async function fetchAccessJwks(teamDomain: string, now = Date.now()): Promise<Jwks> {
  const url = `${teamDomain}/cdn-cgi/access/certs`;
  if (cachedJwks && cachedJwks.url === url && cachedJwks.expires > now) return cachedJwks.value;
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error('Unable to load Access signing keys');
  const value = await response.json() as Jwks;
  cachedJwks = { url, value, expires: now + 10 * 60 * 1000 };
  return value;
}
