// Verifies the Cf-Access-Jwt-Assertion header Cloudflare Access adds in front of admin paths.
// https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/

export interface Jwks { keys: (JsonWebKey & { kid?: string })[] }

export interface AccessVerifyOptions {
  teamDomain: string;
  audience: string;
  now?: number;
  /** `force` asks for keys fresher than the cache, after a token names an unknown kid. */
  jwks: (options?: { force?: boolean }) => Promise<Jwks>;
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
    const findKey = (set: Jwks) => set.keys.find((key) => key.kid === header.kid);
    // Access starts signing with a new key as soon as it rotates, so an unknown kid gets one fresh fetch.
    const jwk = findKey(await options.jwks()) ?? findKey(await options.jwks({ force: true }));
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

const JWKS_TTL_MS = 10 * 60 * 1000;
const FORCED_REFRESH_COOLDOWN_MS = 30 * 1000;
let cachedJwks: { url: string; value: Jwks; fetchedAt: number } | null = null;

/**
 * Fetches the team's signing keys, cached for 10 minutes per isolate. A forced refresh (unknown kid)
 * refetches at most once per 30 seconds, so forged kids cannot turn into a fetch storm.
 */
export async function fetchAccessJwks(teamDomain: string, options: { now?: number; force?: boolean } = {}): Promise<Jwks> {
  const now = options.now ?? Date.now();
  const url = `${teamDomain}/cdn-cgi/access/certs`;
  if (cachedJwks && cachedJwks.url === url) {
    const age = now - cachedJwks.fetchedAt;
    if (options.force ? age < FORCED_REFRESH_COOLDOWN_MS : age < JWKS_TTL_MS) return cachedJwks.value;
  }
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error('Unable to load Access signing keys');
  const value = await response.json() as Jwks;
  cachedJwks = { url, value, fetchedAt: now };
  return value;
}

/** Test hook: forget the cached keys. */
export function resetAccessJwksCache(): void {
  cachedJwks = null;
}
