import { describe, expect, it } from 'vitest';
import { hasSessionCookie, securityHeaderSet } from '../../src/http/headers';

describe('securityHeaderSet', () => {
  it('sets the baseline headers on public pages', () => {
    const h = securityHeaderSet({ pathname: '/tapes', hasSessionCookie: false, production: true });
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Strict-Transport-Security']).toBe('max-age=15552000');
    expect(h['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin-allow-popups');
    expect(h.Vary).toBe('Cookie');
    expect(h['Cache-Control']).toBeUndefined();
    expect(h['X-Robots-Tag']).toBeUndefined();
  });

  it.each(['/me', '/me/submissions', '/login', '/admin', '/admin/tapes', '/api/auth/get-session'])('marks %s private', (pathname) => {
    expect(securityHeaderSet({ pathname, hasSessionCookie: false, production: true })['Cache-Control']).toBe('private, no-store');
  });

  it('marks any response for a signed-in visitor private', () => {
    expect(securityHeaderSet({ pathname: '/tapes', hasSessionCookie: true, production: true })['Cache-Control']).toBe('private, no-store');
  });

  it('noindexes admin and every non-production page', () => {
    expect(securityHeaderSet({ pathname: '/admin', hasSessionCookie: false, production: true })['X-Robots-Tag']).toBe('noindex, nofollow');
    expect(securityHeaderSet({ pathname: '/', hasSessionCookie: false, production: false })['X-Robots-Tag']).toBe('noindex, nofollow');
  });
});

describe('hasSessionCookie', () => {
  it.each([
    ['better-auth.session_token=abc', true],
    ['theme=dark; __Secure-better-auth.session_token=abc', true],
    ['better-auth.session_data=abc', false],
    ['', false],
    [null, false],
  ])('%s → %s', (cookie, expected) => expect(hasSessionCookie(cookie)).toBe(expected));
});
