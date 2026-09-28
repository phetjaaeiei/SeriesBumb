import { beforeAll, describe, expect, it } from 'vitest';
import { verifyAccessJwt, type Jwks } from '../../src/lib/access-jwt';

const TEAM = 'https://seriesbumb.cloudflareaccess.com';
const AUD = 'aud-tag-123';
let keys: CryptoKeyPair;
let jwks: Jwks;

function b64url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  return btoa(String.fromCharCode(...raw)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

async function sign(payload: Record<string, unknown>, kid = 'k1', alg = 'RS256'): Promise<string> {
  const head = b64url(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

const now = 1_800_000_000_000;
const valid = { iss: TEAM, aud: [AUD], email: 'Owner@Example.com', exp: now / 1000 + 600, iat: now / 1000 - 10, nbf: now / 1000 - 10 };

beforeAll(async () => {
  keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
  jwks = { keys: [{ ...jwk, kid: 'k1', alg: 'RS256' } as JsonWebKey & { kid: string }] };
});

describe('verifyAccessJwt', () => {
  const options = () => ({ teamDomain: TEAM, audience: AUD, now, jwks: async () => jwks });

  it('returns the lower-cased email for a valid Access token', async () => {
    expect(await verifyAccessJwt(await sign(valid), options())).toEqual({ email: 'owner@example.com' });
  });

  it.each([
    ['wrong audience', { ...valid, aud: ['other'] }],
    ['wrong issuer', { ...valid, iss: 'https://evil.cloudflareaccess.com' }],
    ['expired beyond the 60 s clock skew', { ...valid, exp: now / 1000 - 120 }],
    ['not yet valid beyond the 60 s clock skew', { ...valid, nbf: now / 1000 + 120 }],
    ['missing email', { ...valid, email: undefined }],
  ])('rejects a token with %s', async (_name, payload) => {
    expect(await verifyAccessJwt(await sign(payload), options())).toBeNull();
  });

  it('rejects unknown keys, other algorithms, tampering and garbage', async () => {
    expect(await verifyAccessJwt(await sign(valid, 'other-kid'), options())).toBeNull();
    expect(await verifyAccessJwt(await sign(valid, 'k1', 'HS256'), options())).toBeNull();
    const token = await sign(valid);
    const [h, , s] = token.split('.');
    expect(await verifyAccessJwt(`${h}.${b64url(JSON.stringify({ ...valid, email: 'attacker@example.com' }))}.${s}`, options())).toBeNull();
    expect(await verifyAccessJwt('not-a-jwt', options())).toBeNull();
    expect(await verifyAccessJwt(null, options())).toBeNull();
  });
});
