import { describe, expect, it } from 'vitest';
import { canComment, isAdmin, parseAdminEmails, requireAdmin, requireUser } from '../../src/lib/permissions';
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
