import { describe, expect, it } from 'vitest';
import { ADMIN_SESSION_MAX_AGE_MS, FRESH_SESSION_MS, adminSessionExpired, isFreshSession } from '../../src/domain/admin-session';

const start = new Date('2026-09-28T00:00:00Z');

describe('admin session policy', () => {
  it('caps admin sessions at 12 hours from sign-in', () => {
    expect(ADMIN_SESSION_MAX_AGE_MS).toBe(12 * 60 * 60 * 1000);
    expect(adminSessionExpired(start, start.getTime() + ADMIN_SESSION_MAX_AGE_MS - 1)).toBe(false);
    expect(adminSessionExpired(start, start.getTime() + ADMIN_SESSION_MAX_AGE_MS)).toBe(true);
  });

  it('treats a session as fresh for 15 minutes after sign-in', () => {
    expect(FRESH_SESSION_MS).toBe(15 * 60 * 1000);
    expect(isFreshSession(start, start.getTime() + FRESH_SESSION_MS - 1)).toBe(true);
    expect(isFreshSession(start, start.getTime() + FRESH_SESSION_MS)).toBe(false);
  });

  it('fails closed on invalid dates', () => {
    expect(adminSessionExpired(new Date('invalid'), start.getTime())).toBe(true);
    expect(isFreshSession(new Date('invalid'), start.getTime())).toBe(false);
  });
});
