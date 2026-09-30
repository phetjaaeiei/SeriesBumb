// The admin audit log: one row per admin write (who, what, which record, outcome, when).
import type { SqlClient } from '../db/sql-client';

export interface AuditEntry {
  actorUserId: string;
  actorEmail: string;
  action: string;
  targetId: string | null;
  status: number;
}

export interface AuditRow extends AuditEntry { id: string; createdAt: number }

/** Appends one audit row. */
export async function insertAuditLog(sql: SqlClient, id: string, entry: AuditEntry, now: number): Promise<void> {
  await sql.prepare('INSERT INTO audit_log (id, actorUserId, actorEmail, action, targetId, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, entry.actorUserId, entry.actorEmail, entry.action, entry.targetId, entry.status, now).run();
}

/** One page of `limit` audit rows, newest first, after `cursor`, and the cursor of the next page (null on the last one). */
export async function listAudit(sql: SqlClient, cursor: { createdAt: number; id: string } | null, limit = 50): Promise<{ rows: AuditRow[]; next: { createdAt: number; id: string } | null }> {
  const statement = cursor
    ? sql.prepare('SELECT id, actorUserId, actorEmail, action, targetId, status, createdAt FROM audit_log WHERE (createdAt, id) < (?, ?) ORDER BY createdAt DESC, id DESC LIMIT ?').bind(cursor.createdAt, cursor.id, limit + 1)
    : sql.prepare('SELECT id, actorUserId, actorEmail, action, targetId, status, createdAt FROM audit_log ORDER BY createdAt DESC, id DESC LIMIT ?').bind(limit + 1);
  const results = (await statement.all<AuditRow>()).results;
  const rows = results.slice(0, limit);
  const last = rows.at(-1);
  return { rows, next: results.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null };
}
