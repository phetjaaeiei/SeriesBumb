// Admin accountability without extra personal data: who, what, which record, outcome, when.

const UUID_IN_PATH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/iu;
const TARGET_KEYS = ['id', 'tapeId', 'songId', 'userId', 'artistId', 'memberId', 'targetId', 'personId', 'imageId', 'entityId', 'relatedArtistId'] as const;

/** Admin actions that only read or run background maintenance; they are not recorded. */
export const UNAUDITED_ACTIONS = new Set(['admin.lookup', 'admin.health', 'admin.search.continue']);

/**
 * Name of the admin action a request runs, resolved the way Astro resolves it so neither the
 * guard nor the audit can be sidestepped: RPC takes everything after the last `/_actions/`,
 * form dispatch reads `?_action=` on any page, and each dotted key is URI-decoded.
 */
export function adminActionNameFrom(url: URL): string | null {
  const raw = url.pathname.startsWith('/_actions/')
    ? url.pathname.replace(/^.*\/_actions\//u, '')
    : url.searchParams.get('_action') ?? '';
  try {
    const name = raw.replace(/\/+$/u, '').split('.').map((key) => decodeURIComponent(key)).join('.');
    return name.startsWith('admin.') ? name : null;
  } catch {
    return null;
  }
}

/** Name to record for a write to the admin REST API, or null. The target comes from the path only. */
export function auditApiActionFor(method: string, pathname: string): string | null {
  const verb = method.toUpperCase();
  if (!pathname.startsWith('/admin/api/') || verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return null;
  return `${verb} ${pathname.replace(new RegExp(`/${UUID_IN_PATH.source}`, 'giu'), '').replace(/\/+$/u, '')}`;
}

export function auditTargetFromPath(pathname: string): string | null {
  return pathname.match(UUID_IN_PATH)?.[0] ?? null;
}

/** Target id from action input that already passed zod validation. */
export function auditTargetFromInput(input: unknown): string | null {
  if (!input || typeof input !== 'object' || input instanceof FormData) return null;
  for (const key of TARGET_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.length > 0 && value.length <= 100) return value;
  }
  return null;
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

export interface AuditActor { id: string; email: string }

/**
 * Runs an admin write and records who did it, to what, and how it ended.
 * A failed audit write is logged by name only and never changes the write's outcome.
 */
export async function withAudit<R>(
  db: D1Database,
  entry: { actor: AuditActor; action: string; targetId: string | null },
  run: () => Promise<R> | R,
  statusOf: (error: unknown) => number,
): Promise<R> {
  let status = 200;
  try {
    return await run();
  } catch (error) {
    status = statusOf(error);
    throw error;
  } finally {
    try {
      await recordAudit(db, { actorUserId: entry.actor.id, actorEmail: entry.actor.email, action: entry.action, targetId: entry.targetId, status });
    } catch (error) {
      console.error('Unable to record admin audit', error instanceof Error ? error.name : 'unknown');
    }
  }
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
