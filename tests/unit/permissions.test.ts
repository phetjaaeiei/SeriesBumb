import { describe, expect, it } from 'vitest';
import { canComment, isAdmin, parseAdminEmails, requireAdmin, requireUser, requireFreshSession } from '../../src/lib/permissions';
import type { SessionUser } from '../../src/lib/types';

const member: SessionUser = {
  id: 'member-1', name: 'สมาชิก', email: 'member@example.com', image: null,
  role: 'member', commentBanned: false,
};

describe('permissions', () => {
  it('parses complete email addresses without substring matches', () => {
    const emails = parseAdminEmails(' Admin@Example.com , ,other@example.com ');
    expect([...emails]).toEqual(['admin@example.com', 'other@example.com']);
    expect(emails.has('shop.admin@example.com')).toBe(false);
  });

  it('checks the current session role and comment ban', () => {
    expect(isAdmin(member)).toBe(false);
    expect(isAdmin({ ...member, role: 'admin' })).toBe(true);
    expect(canComment(member)).toBe(true);
    expect(canComment({ ...member, commentBanned: true })).toBe(false);
    expect(canComment(null)).toBe(false);
  });

  it('requires a current user and admin role', () => {
    expect(() => requireUser({ user: null } as App.Locals)).toThrow('UNAUTHORIZED');
    expect(() => requireAdmin({ user: member } as App.Locals)).toThrow('FORBIDDEN');
    expect(requireAdmin({ user: { ...member, role: 'admin' } } as App.Locals).id).toBe(member.id);
  });
});

describe('requireFreshSession', () => {
  const admin = { id: 'a', name: 'A', email: 'a@example.com', image: null, role: 'admin' as const, commentBanned: false };
  it('allows a sign-in from the last 15 minutes', () => {
    const locals = { user: admin, session: { id: 's', expiresAt: new Date(Date.now() + 1e6), createdAt: new Date(Date.now() - 60_000) } };
    expect(() => requireFreshSession(locals)).not.toThrow();
  });
  it('asks older sessions to sign in again', () => {
    const locals = { user: admin, session: { id: 's', expiresAt: new Date(Date.now() + 1e6), createdAt: new Date(Date.now() - 16 * 60_000) } };
    expect(() => requireFreshSession(locals)).toThrow('กรุณาเข้าสู่ระบบใหม่');
  });
  it('rejects a missing session', () => {
    expect(() => requireFreshSession({ user: admin, session: null })).toThrow();
  });
});
