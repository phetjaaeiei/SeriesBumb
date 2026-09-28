import { describe, expect, it } from 'vitest';
import { auditActionFor, auditTargetFrom } from '../../src/lib/services/audit';

describe('auditActionFor', () => {
  it.each([
    ['POST', '/_actions/admin.tapes.save', 'admin.tapes.save'],
    ['POST', '/_actions/admin.users.setRole', 'admin.users.setRole'],
    ['POST', '/admin/api/audio', 'POST /admin/api/audio'],
    ['DELETE', '/admin/api/audio/0b4f7e1a-7b6c-4a51-9d0c-3a6c1a2b9f10', 'DELETE /admin/api/audio'],
    ['POST', '/admin/api/audio/0b4f7e1a-7b6c-4a51-9d0c-3a6c1a2b9f10/finalize', 'POST /admin/api/audio/finalize'],
  ])('%s %s → %s', (method, path, action) => expect(auditActionFor(method, path)).toBe(action));

  it.each([
    ['POST', '/_actions/admin.lookup'],
    ['POST', '/_actions/admin.health'],
    ['GET', '/admin/api/audio'],
    ['GET', '/admin/api/image/0b4f7e1a-7b6c-4a51-9d0c-3a6c1a2b9f10'],
    ['POST', '/_actions/comments.create'],
    ['GET', '/admin/tapes'],
  ])('skips %s %s', (method, path) => expect(auditActionFor(method, path)).toBeNull());
});

describe('auditTargetFrom', () => {
  const id = '0b4f7e1a-7b6c-4a51-9d0c-3a6c1a2b9f10';
  it('prefers the record id in the body', () => expect(auditTargetFrom({ id: 'a', tapeId: 'b' }, '/_actions/admin.tapes.save')).toBe('a'));
  it.each(['tapeId', 'songId', 'userId', 'artistId', 'memberId', 'targetId', 'personId'])('falls back to %s', (key) => {
    expect(auditTargetFrom({ [key]: 'x' }, '/_actions/admin.x')).toBe('x');
  });
  it('uses the UUID in the path when the body has none', () => expect(auditTargetFrom(null, `/admin/api/audio/${id}`)).toBe(id));
  it('ignores non-string and oversized ids', () => {
    expect(auditTargetFrom({ id: 5 }, '/_actions/admin.x')).toBeNull();
    expect(auditTargetFrom({ id: 'x'.repeat(200) }, '/_actions/admin.x')).toBeNull();
  });
});
