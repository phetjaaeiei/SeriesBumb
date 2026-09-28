import { describe, expect, it } from 'vitest';
import { isAllowedAuthPath } from '../../src/auth/auth-routes';

describe('isAllowedAuthPath', () => {
  it.each([
    ['POST', '/api/auth/sign-in/social'],
    ['GET', '/api/auth/callback/google'],
    ['POST', '/api/auth/callback/google'],
    ['GET', '/api/auth/get-session'],
    ['POST', '/api/auth/sign-out'],
  ])('allows %s %s', (method, path) => expect(isAllowedAuthPath(method, path)).toBe(true));

  it.each([
    ['POST', '/api/auth/sign-up/email'],
    ['POST', '/api/auth/sign-in/email'],
    ['GET', '/api/auth/get-access-token'],
    ['POST', '/api/auth/refresh-token'],
    ['POST', '/api/auth/link-social'],
    ['POST', '/api/auth/delete-user'],
    ['POST', '/api/auth/update-user'],
    ['GET', '/api/auth/sign-in/social'],
    ['GET', '/api/auth/callback/github'],
  ])('blocks %s %s', (method, path) => expect(isAllowedAuthPath(method, path)).toBe(false));
});
