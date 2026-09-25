import { parseAdminEmails } from '../admin-emails';
import { CommentError } from './comments';

export async function setUserRole(db: D1Database, adminId: string, targetId: string, role: 'member' | 'admin', bootstrapEmails: string) {
  const target = await db.prepare('SELECT id, email, role FROM user WHERE id = ?').bind(targetId).first<{ id: string; email: string; role: 'member' | 'admin' }>();
  if (!target) throw new CommentError('ไม่พบผู้ใช้นี้', 'NOT_FOUND');
  if (role === 'member' && targetId === adminId) throw new CommentError('ถอดสิทธิ์แอดมินของตัวเองไม่ได้');
  if (role === 'member' && parseAdminEmails(bootstrapEmails).has(target.email.toLowerCase())) throw new CommentError('ถอดสิทธิ์แอดมินตั้งต้นไม่ได้');
  await db.prepare('UPDATE user SET role = ?, commentBanned = CASE WHEN ? = ? THEN 0 ELSE commentBanned END, updatedAt = ? WHERE id = ?').bind(role, role, 'admin', Date.now(), targetId).run();
  return { id: targetId, role };
}

export async function setCommentBan(db: D1Database, targetId: string, banned: boolean) {
  const target = await db.prepare('SELECT id, role FROM user WHERE id = ?').bind(targetId).first<{ id: string; role: string }>();
  if (!target) throw new CommentError('ไม่พบผู้ใช้นี้', 'NOT_FOUND');
  if (banned && target.role === 'admin') throw new CommentError('แบนแอดมินไม่ได้ ต้องถอดสิทธิ์แอดมินก่อน');
  await db.prepare('UPDATE user SET commentBanned = ?, updatedAt = ? WHERE id = ?').bind(Number(banned), Date.now(), targetId).run();
  return { id: targetId, banned };
}

export async function moderateComment(db: D1Database, adminId: string, commentId: string, restore: boolean) {
  const row = await db.prepare('SELECT id, tapeId, songId, deletedAt, deletedBy FROM comment WHERE id = ?').bind(commentId).first<{ id: string; tapeId: string | null; songId: string | null; deletedAt: number | null; deletedBy: string | null }>();
  if (!row) throw new CommentError('ไม่พบคอมเมนต์นี้', 'NOT_FOUND');
  if (restore) {
    if (row.deletedAt === null || !row.deletedBy) throw new CommentError('คอมเมนต์นี้ยังไม่ถูกลบ');
    const deleter = await db.prepare('SELECT role FROM user WHERE id = ?').bind(row.deletedBy).first<{ role: string }>();
    if (deleter?.role !== 'admin') throw new CommentError('กู้คืนได้เฉพาะคอมเมนต์ที่แอดมินลบ');
  }
  const changed = restore
    ? await db.prepare('UPDATE comment SET deletedAt = NULL, deletedBy = NULL WHERE id = ? AND deletedAt IS NOT NULL').bind(commentId).run()
    : await db.prepare('UPDATE comment SET deletedAt = ?, deletedBy = ? WHERE id = ? AND deletedAt IS NULL').bind(Date.now(), adminId, commentId).run();
  if (!changed.meta.changes) throw new CommentError('สถานะคอมเมนต์เปลี่ยนไปแล้ว');
  const table = row.tapeId ? 'tape' : 'song';
  const column = row.tapeId ? 'tapeId' : 'songId';
  const id = row.tapeId || row.songId!;
  await db.prepare(`UPDATE ${table} SET commentCount = (SELECT COUNT(*) FROM comment WHERE ${column} = ? AND deletedAt IS NULL) WHERE id = ?`).bind(id, id).run();
  return { id: commentId, deleted: !restore };
}
