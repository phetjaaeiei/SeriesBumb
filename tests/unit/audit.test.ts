import { describe, expect, it, vi } from 'vitest';
import { adminActionNameFrom, auditApiActionFor, auditTargetFromInput, auditTargetFromPath, withAudit } from '../../src/lib/services/audit';

describe('adminActionNameFrom', () => {
  it.each([
    ['https://x.test/_actions/admin.tapes.save', 'admin.tapes.save'],
    ['https://x.test/_actions/admin.tapes.save/', 'admin.tapes.save'],
    ['https://x.test/?_action=admin.deleteCatalog', 'admin.deleteCatalog'],
    ['https://x.test/tapes/abc?_action=admin.users.setRole', 'admin.users.setRole'],
    // Astro decodes each dotted key and takes everything after the last `/_actions/`.
    ['https://x.test/_actions/%61dmin.tapes.save', 'admin.tapes.save'],
    ['https://x.test/_actions/x/_actions/admin.tapes.save', 'admin.tapes.save'],
    ['https://x.test/?_action=%2561dmin.deleteCatalog', 'admin.deleteCatalog'],
  ])('%s → %s', (url, name) => expect(adminActionNameFrom(new URL(url))).toBe(name));

  it('ignores member actions and unrelated URLs', () => {
    expect(adminActionNameFrom(new URL('https://x.test/_actions/comments.create/'))).toBeNull();
    expect(adminActionNameFrom(new URL('https://x.test/admin/tapes'))).toBeNull();
    expect(adminActionNameFrom(new URL('https://x.test/_actions/%E0%A4%A.x'))).toBeNull();
  });
});

describe('auditApiActionFor', () => {
  const id = '0b4f7e1a-7b6c-4a51-9d0c-3a6c1a2b9f10';
  it.each([
    ['POST', '/admin/api/audio', 'POST /admin/api/audio'],
    ['DELETE', `/admin/api/audio/${id}`, 'DELETE /admin/api/audio'],
    ['POST', `/admin/api/audio/${id}/finalize/`, 'POST /admin/api/audio/finalize'],
  ])('%s %s → %s', (method, path, action) => expect(auditApiActionFor(method, path)).toBe(action));
  it.each([['GET', '/admin/api/audio'], ['HEAD', `/admin/api/audio/${id}`], ['POST', '/admin/tapes']])('skips %s %s', (method, path) => {
    expect(auditApiActionFor(method, path)).toBeNull();
  });
});

describe('auditTargetFromInput', () => {
  it('uses the validated record id first', () => expect(auditTargetFromInput({ id: 'a', tapeId: 'b' })).toBe('a'));
  it.each(['tapeId', 'songId', 'userId', 'artistId', 'memberId', 'targetId', 'personId', 'imageId', 'entityId', 'relatedArtistId'])('falls back to %s', (key) => {
    expect(auditTargetFromInput({ [key]: 'x' })).toBe('x');
  });
  it('returns null for FormData-free or odd input', () => {
    expect(auditTargetFromInput(null)).toBeNull();
    expect(auditTargetFromInput({ id: 5 })).toBeNull();
    expect(auditTargetFromInput({ id: 'x'.repeat(200) })).toBeNull();
  });
});

describe('auditTargetFromPath', () => {
  it('takes the first UUID in the path', () => {
    expect(auditTargetFromPath('/admin/api/audio/0b4f7e1a-7b6c-4a51-9d0c-3a6c1a2b9f10/finalize')).toBe('0b4f7e1a-7b6c-4a51-9d0c-3a6c1a2b9f10');
    expect(auditTargetFromPath('/admin/api/audio')).toBeNull();
  });
});

describe('withAudit', () => {
  function fakeDb(fail = false) {
    const rows: unknown[][] = [];
    const db = {
      prepare: () => ({
        bind: (...values: unknown[]) => ({
          run: async () => {
            if (fail) throw new Error('D1 down');
            rows.push(values);
          },
        }),
      }),
    } as unknown as D1Database;
    return { db, rows };
  }
  const entry = { actor: { id: 'u1', email: 'a@example.test' }, action: 'admin.tapes.save', targetId: 't1' };

  it('records 200 and returns the result', async () => {
    const { db, rows } = fakeDb();
    await expect(withAudit(db, entry, async () => 'ok', () => 500)).resolves.toBe('ok');
    expect(rows[0].slice(1, 6)).toEqual(['u1', 'a@example.test', 'admin.tapes.save', 't1', 200]);
  });

  it('records the error status and rethrows', async () => {
    const { db, rows } = fakeDb();
    const error = new Error('nope');
    await expect(withAudit(db, entry, () => { throw error; }, () => 403)).rejects.toBe(error);
    expect(rows[0][5]).toBe(403);
  });

  it('never lets a failed audit write change the outcome', async () => {
    const { db } = fakeDb(true);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(withAudit(db, entry, async () => 'ok', () => 500)).resolves.toBe('ok');
    expect(spy).toHaveBeenCalledWith('Unable to record admin audit', 'Error');
    spy.mockRestore();
  });
});
