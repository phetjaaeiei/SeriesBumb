import type { SqlClient } from '../../db/sql-client';
import { decodeCursor, encodeCursor } from '../../domain/cursor';
import type { SessionUser } from '../../domain/types';
import { listAdminUsers, type AdminUserListRow } from '../../repositories/users.repo';
import { canManageRoles } from '../../services/admin-community';

export interface AdminUserModelRow extends AdminUserListRow {
  /** A bootstrap admin from ADMIN_EMAILS, whose role cannot be removed. */
  protectedAdmin: boolean;
  /** The signed-in admin's own row. */
  self: boolean;
}

export interface AdminUsersModel {
  /** `?q=` trimmed to 100 characters. */
  query: string;
  rows: AdminUserModelRow[];
  next: string | null;
  /** Only bootstrap admins may appoint or remove admins. */
  canManageRoles: boolean;
}

/** `/admin/users`: 50 users per page, newest first, filtered by name or email. */
export async function loadAdminUsers(sql: SqlClient, params: URLSearchParams, viewer: Pick<SessionUser, 'id' | 'email'> | null | undefined, bootstrapAdmins: ReadonlySet<string>): Promise<AdminUsersModel> {
  const query = (params.get('q') || '').trim().slice(0, 100);
  const cursor = decodeCursor('new', params.get('cursor'));
  const all = await listAdminUsers(sql, query, cursor);
  const rows: AdminUserModelRow[] = all.slice(0, 50).map(row => ({ ...row, protectedAdmin: bootstrapAdmins.has(row.email.toLowerCase()), self: row.id === viewer?.id }));
  const manageRoles = canManageRoles(viewer?.email ?? '', bootstrapAdmins);
  const last = rows.at(-1);
  const next = all.length > 50 && last ? encodeCursor('new', last.createdAt, last.id) : null;
  return { query, rows, next, canManageRoles: manageRoles };
}
