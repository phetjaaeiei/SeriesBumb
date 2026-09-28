// Admin accountability without extra personal data: who, what, which record, outcome, when.

const READ_ONLY_ACTIONS = new Set(['admin.lookup', 'admin.health']);
const UUID_IN_PATH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;
const TARGET_KEYS = ['id', 'tapeId', 'songId', 'userId', 'artistId', 'memberId', 'targetId', 'personId'] as const;

/** Name to record for an admin write, or null when the request is not an admin write. */
export function auditActionFor(method: string, pathname: string): string | null {
  const verb = method.toUpperCase();
  if (pathname.startsWith('/_actions/admin.')) {
    const name = pathname.slice('/_actions/'.length);
    return verb === 'POST' && !READ_ONLY_ACTIONS.has(name) ? name : null;
  }
  if (pathname.startsWith('/admin/api/') && verb !== 'GET' && verb !== 'HEAD') {
    return `${verb} ${pathname.replace(new RegExp(`/${UUID_IN_PATH.source}`, 'giu'), '')}`;
  }
  return null;
}

export function auditTargetFrom(body: unknown, pathname: string): string | null {
  if (body && typeof body === 'object') {
    for (const key of TARGET_KEYS) {
      const value = (body as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.length > 0 && value.length <= 100) return value;
    }
  }
  return pathname.match(UUID_IN_PATH)?.[0] ?? null;
}

export interface AuditEntry {
  actorUserId: string;
  actorEmail: string;
  action: string;
  targetId: string | null;
  status: number;
}

export async function recordAudit(db: D1Database, entry: AuditEntry, now = Date.now()): Promise<void> {
  await db.prepare('INSERT INTO audit_log (id, actorUserId, actorEmail, action, targetId, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), entry.actorUserId, entry.actorEmail, entry.action, entry.targetId, entry.status, now).run();
}

export interface AuditRow extends AuditEntry { id: string; createdAt: number }

export async function listAudit(db: D1Database, cursor: { createdAt: number; id: string } | null, limit = 50): Promise<{ rows: AuditRow[]; next: { createdAt: number; id: string } | null }> {
  const statement = cursor
    ? db.prepare('SELECT id, actorUserId, actorEmail, action, targetId, status, createdAt FROM audit_log WHERE (createdAt, id) < (?, ?) ORDER BY createdAt DESC, id DESC LIMIT ?').bind(cursor.createdAt, cursor.id, limit + 1)
    : db.prepare('SELECT id, actorUserId, actorEmail, action, targetId, status, createdAt FROM audit_log ORDER BY createdAt DESC, id DESC LIMIT ?').bind(limit + 1);
  const results = (await statement.all<AuditRow>()).results;
  const rows = results.slice(0, limit);
  const last = rows.at(-1);
  return { rows, next: results.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null };
}
