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

/** The user's comment ban flag (0 or 1), or null when the user does not exist. */
export async function getUserCommentBanned(sql: SqlClient, userId: string): Promise<{ commentBanned: number } | null> {
  return sql.prepare('SELECT commentBanned FROM user WHERE id = ?').bind(userId).first<{ commentBanned: number }>();
}

/** The user's email and role, for changing that role, or null. */
export async function getUserForRoleChange(sql: SqlClient, userId: string): Promise<{ id: string; email: string; role: 'member' | 'admin' } | null> {
  return sql.prepare('SELECT id, email, role FROM user WHERE id = ?').bind(userId).first<{ id: string; email: string; role: 'member' | 'admin' }>();
}

/** Sets the user's role; becoming an admin also lifts a comment ban. */
export async function updateUserRole(sql: SqlClient, userId: string, role: 'member' | 'admin', now: number): Promise<void> {
  await sql.prepare('UPDATE user SET role = ?, commentBanned = CASE WHEN ? = ? THEN 0 ELSE commentBanned END, updatedAt = ? WHERE id = ?').bind(role, role, 'admin', now, userId).run();
}

/** The user's role, for banning them from comments, or null. */
export async function getUserRole(sql: SqlClient, userId: string): Promise<{ id: string; role: string } | null> {
  return sql.prepare('SELECT id, role FROM user WHERE id = ?').bind(userId).first<{ id: string; role: string }>();
}

/** Sets the user's comment ban flag (0 or 1). */
export async function setUserCommentBanned(sql: SqlClient, userId: string, banned: number, now: number): Promise<void> {
  await sql.prepare('UPDATE user SET commentBanned = ?, updatedAt = ? WHERE id = ?').bind(banned, now, userId).run();
}
