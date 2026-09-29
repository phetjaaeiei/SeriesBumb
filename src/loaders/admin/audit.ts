import type { SqlClient } from '../../db/sql-client';
import { decodeCursor, encodeCursor } from '../../domain/cursor';
import { listAudit, type AuditRow } from '../../services/audit';

export type { AuditRow };

export interface AdminAuditModel {
  rows: AuditRow[];
  nextCursor: string | null;
}

/** `/admin/audit`: 50 audit log entries per page, newest first. */
export async function loadAdminAudit(sql: SqlClient, params: URLSearchParams): Promise<AdminAuditModel> {
  const cursor = decodeCursor('new', params.get('cursor'));
  const { rows, next } = await listAudit(sql, cursor ? { createdAt: Number(cursor.key), id: cursor.id } : null);
  const nextCursor = next ? encodeCursor('new', next.createdAt, next.id) : null;
  return { rows, nextCursor };
}
