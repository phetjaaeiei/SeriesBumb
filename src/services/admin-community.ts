import type { SqlClient } from '../db/sql-client';
import { adminDeleteComment, getCommentForModeration, refreshCommentCount, restoreAdminDeletedComment } from '../repositories/community.repo';
import { getUserForRoleChange, getUserRole, setUserCommentBanned, updateUserRole } from '../repositories/users.repo';
import { CommentError } from './comments';

/** Only bootstrap owners (ADMIN_EMAILS) may grant or remove admin, so a compromised deputy cannot mint admins. */
export function canManageRoles(actorEmail: string, bootstrapEmails: ReadonlySet<string>): boolean {
  return bootstrapEmails.has(actorEmail.trim().toLowerCase());
}

export async function setUserRole(db: SqlClient, actor: { id: string; email: string }, targetId: string, role: 'member' | 'admin', bootstrapEmails: ReadonlySet<string>) {
  const target = await getUserForRoleChange(db, targetId);
  if (!target) throw new CommentError('ไม่พบผู้ใช้นี้', 'NOT_FOUND');
  if (role === 'member' && targetId === actor.id) throw new CommentError('ถอดสิทธิ์แอดมินของตัวเองไม่ได้');
  if (!canManageRoles(actor.email, bootstrapEmails)) throw new CommentError('เฉพาะแอดมินตั้งต้นเท่านั้นที่เปลี่ยนสิทธิ์แอดมินได้', 'FORBIDDEN');
  if (role === 'member' && bootstrapEmails.has(target.email.toLowerCase())) throw new CommentError('ถอดสิทธิ์แอดมินตั้งต้นไม่ได้');
  await updateUserRole(db, targetId, role, Date.now());
  return { id: targetId, role };
}

export async function setCommentBan(db: SqlClient, targetId: string, banned: boolean) {
  const target = await getUserRole(db, targetId);
  if (!target) throw new CommentError('ไม่พบผู้ใช้นี้', 'NOT_FOUND');
  if (banned && target.role === 'admin') throw new CommentError('แบนแอดมินไม่ได้ ต้องถอดสิทธิ์แอดมินก่อน');
  await setUserCommentBanned(db, targetId, Number(banned), Date.now());
  return { id: targetId, banned };
}

export async function moderateComment(db: SqlClient, adminId: string, commentId: string, restore: boolean) {
  const row = await getCommentForModeration(db, commentId);
  if (!row) throw new CommentError('ไม่พบคอมเมนต์นี้', 'NOT_FOUND');
  if (restore) {
    if (row.deletedAt === null) throw new CommentError('คอมเมนต์นี้ยังไม่ถูกลบ');
    if (!row.deletedByAdmin) throw new CommentError('กู้คืนได้เฉพาะคอมเมนต์ที่แอดมินลบ');
  }
  const changes = restore
    ? await restoreAdminDeletedComment(db, commentId)
    : await adminDeleteComment(db, commentId, adminId, Date.now());
  if (!changes) throw new CommentError('สถานะคอมเมนต์เปลี่ยนไปแล้ว');
  await refreshCommentCount(db, row.tapeId ? { tapeId: row.tapeId } : { songId: row.songId! });
  return { id: commentId, deleted: !restore };
}
