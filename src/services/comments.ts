import type { SqlClient } from '../db/sql-client';
import { AppError } from '../errors/app-error';
import { decodeCursor, encodeCursor } from '../domain/cursor';
import {
  getCommentRow, getOwnLiveCommentTarget, getVisibleCommentTarget, insertCommentIfAllowed, listCommentRows, refreshCommentCount, softDeleteOwnComment,
  type CommentRow, type CommentTarget,
} from '../repositories/community.repo';
import { getUserCommentBanned } from '../repositories/users.repo';

export type { CommentTarget };

export interface CommentDto {
  id: string;
  body: string;
  createdAt: number;
  author: { name: string; image: string | null };
  isMine: boolean;
}

export class CommentError extends AppError {
  constructor(message: string, code: 'BAD_REQUEST' | 'NOT_FOUND' | 'FORBIDDEN' = 'BAD_REQUEST') { super(message, code); }
}

export function normalizeComment(input: string): string {
  return input.normalize('NFC')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f‪-‮⁦-⁩]/gu, '')
    .replace(/\r\n?/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

async function assertVisible(db: SqlClient, target: CommentTarget) {
  const row = await getVisibleCommentTarget(db, target);
  if (!row) throw new CommentError('ไม่พบรายการนี้', 'NOT_FOUND');
}

function safeAvatar(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.googleusercontent.com') ? url.href : null;
  } catch { return null; }
}

function dto(row: CommentRow, viewerId?: string | null): CommentDto {
  return { id: row.id, body: row.body, createdAt: row.createdAt, author: { name: [...row.name].slice(0, 50).join(''), image: safeAvatar(row.image) }, isMine: row.userId === viewerId };
}

/**
 * One page of 20 comments on a visible tape or song, newest first, as the viewer sees them (their own
 * marked, avatars limited to Google's image host). Shared by the comments.list action and the tape
 * and song loaders; throws NOT_FOUND when the target is not visible.
 */
export async function listComments(db: SqlClient, target: CommentTarget, cursor?: string | null, viewerId?: string | null) {
  await assertVisible(db, target);
  const decoded = decodeCursor('new', cursor);
  const rows = await listCommentRows(db, target, decoded);
  const more = rows.length > 20;
  const page = rows.slice(0, 20);
  const last = page.at(-1);
  return { items: page.map(row => dto(row, viewerId)), nextCursor: more && last ? encodeCursor('new', last.createdAt, last.id) : null };
}

export async function createComment(db: SqlClient, userId: string, role: 'member' | 'admin', target: CommentTarget, rawBody: string) {
  const body = normalizeComment(rawBody);
  if ([...body].length < 1 || [...body].length > 1000) throw new CommentError('คอมเมนต์ต้องมี 1–1,000 ตัวอักษร');
  const id = crypto.randomUUID();
  const now = Date.now();
  // Admins skip the rate limit: 5 comments a minute and 50 a day for members.
  const rateWindows = role === 'admin' ? null : { minuteSince: now - 60_000, daySince: now - 86_400_000 };
  const changes = await insertCommentIfAllowed(db, { id, userId, target, body, now }, rateWindows);
  if (!changes) {
    const current = await getUserCommentBanned(db, userId);
    if (current?.commentBanned) throw new CommentError('บัญชีนี้ถูกระงับการคอมเมนต์', 'FORBIDDEN');
    await assertVisible(db, target);
    throw new CommentError('คอมเมนต์ถี่เกินไป กรุณารอสักครู่');
  }
  await refreshCommentCount(db, target);
  const row = await getCommentRow(db, id);
  return dto(row!, userId);
}

export async function deleteOwnComment(db: SqlClient, userId: string, commentId: string) {
  const row = await getOwnLiveCommentTarget(db, commentId, userId);
  if (!row) throw new CommentError('ไม่พบคอมเมนต์นี้', 'NOT_FOUND');
  const changes = await softDeleteOwnComment(db, commentId, userId, Date.now());
  if (!changes) throw new CommentError('ไม่พบคอมเมนต์นี้', 'NOT_FOUND');
  await refreshCommentCount(db, row.tapeId ? { tapeId: row.tapeId } : { songId: row.songId! });
  return { id: commentId };
}
