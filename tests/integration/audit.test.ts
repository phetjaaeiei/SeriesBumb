import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { listAudit, recordAudit, withAudit } from '../../src/lib/services/audit';

describe('audit log', () => {
  it('records admin writes and lists them newest first with a cursor', async () => {
    const actor = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare("INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt) VALUES (?, 'แอดมิน', ?, 1, 'admin', ?, ?)").bind(actor, `${actor}@example.test`, now, now).run();
    for (let i = 0; i < 3; i += 1) {
      await recordAudit(env.DB, { actorUserId: actor, actorEmail: `${actor}@example.test`, action: `admin.test.${i}`, targetId: `t${i}`, status: 200 }, now + i);
    }
    const first = await listAudit(env.DB, null, 2);
    expect(first.rows.map((row) => row.action).slice(0, 2)).toEqual(['admin.test.2', 'admin.test.1']);
    expect(first.next).not.toBeNull();
    const second = await listAudit(env.DB, first.next, 2);
    expect(second.rows[0].action).toBe('admin.test.0');
  });

  it('keeps the audit row when the admin account is deleted', async () => {
    const actor = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare("INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt) VALUES (?, 'แอดมิน', ?, 1, 'admin', ?, ?)").bind(actor, `${actor}@example.test`, now, now).run();
    await recordAudit(env.DB, { actorUserId: actor, actorEmail: `${actor}@example.test`, action: 'admin.deleteCatalog', targetId: 'x', status: 200 }, now);
    await env.DB.prepare('DELETE FROM user WHERE id = ?').bind(actor).run();
    const row = await env.DB.prepare('SELECT actorUserId, actorEmail FROM audit_log WHERE actorEmail = ?').bind(`${actor}@example.test`).first();
    expect(row).toEqual({ actorUserId: null, actorEmail: `${actor}@example.test` });
  });

  it('records a failed admin write with its status and still surfaces the error', async () => {
    const actor = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare("INSERT INTO user (id, name, email, emailVerified, role, createdAt, updatedAt) VALUES (?, 'แอดมิน', ?, 1, 'admin', ?, ?)").bind(actor, `${actor}@example.test`, now, now).run();
    const entry = { actor: { id: actor, email: `${actor}@example.test` }, action: 'admin.deleteCatalog', targetId: 'tape-1' };
    await expect(withAudit(env.DB, entry, () => { throw new Error('stale session'); }, () => 403)).rejects.toThrow('stale session');
    await expect(withAudit(env.DB, entry, async () => 'deleted', () => 500)).resolves.toBe('deleted');
    const rows = await env.DB.prepare('SELECT action, targetId, status FROM audit_log WHERE actorUserId = ? ORDER BY status').bind(actor).all();
    expect(rows.results).toEqual([
      { action: 'admin.deleteCatalog', targetId: 'tape-1', status: 200 },
      { action: 'admin.deleteCatalog', targetId: 'tape-1', status: 403 },
    ]);
  });
});
