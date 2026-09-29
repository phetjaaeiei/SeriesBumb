import type { SqlClient } from '../db/sql-client';
import type { CursorKey } from '../domain/cursor';
import type { SessionUser } from '../domain/types';

export type SessionUserRow = Omit<SessionUser, 'commentBanned'> & { commentBanned: number };

/** The signed-in user's current profile and role (commentBanned as stored, 0 or 1), or null. */
export async function getSessionUserRow(sql: SqlClient, userId: string): Promise<SessionUserRow | null> {
  return sql.prepare('SELECT id, name, email, image, role, commentBanned FROM user WHERE id = ?').bind(userId).first<SessionUserRow>();
}

export interface AdminUserListRow { id: string; name: string; email: string; role: 'member' | 'admin'; commentBanned: number; createdAt: number }

/** Up to 51 users, newest first, after `cursor`, whose name or email contains `query` when it is not empty. */
export async function listAdminUsers(sql: SqlClient, query: string, cursor: { key: CursorKey; id: string } | null): Promise<AdminUserListRow[]> {
  const where = query ? 'AND (name LIKE ? OR email LIKE ?)' : '';
  const page = cursor ? 'AND (createdAt, id) < (?, ?)' : '';
  const bind = [ ...(query ? [`%${query}%`, `%${query}%`] : []), ...(cursor ? [cursor.key, cursor.id] : []) ];
  return (await sql.prepare(`SELECT id, name, email, role, commentBanned, createdAt FROM user WHERE 1 = 1 ${where} ${page} ORDER BY createdAt DESC, id DESC LIMIT 51`).bind(...bind).all<AdminUserListRow>()).results;
}
