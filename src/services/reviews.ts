import type { SqlClient } from '../db/sql-client';
import { AppError } from '../errors/app-error';
import { getVisibleTargetId, insertPendingCorrection, insertPendingReview, setPendingCorrectionStatus, setPendingReviewStatus } from '../repositories/community.repo';
import { getUserCommentBanned } from '../repositories/users.repo';
import { normalizeComment } from './comments';
import { validateSourceUrl } from './catalog-sources';

export class ReviewError extends AppError {
  constructor(message: string, code: 'BAD_REQUEST' | 'NOT_FOUND' | 'FORBIDDEN' = 'BAD_REQUEST') { super(message, code); }
}

const normalizeBody = (raw: string, min: number, max: number) => {
  const body = normalizeComment(raw);
  if ([...body].length < min || [...body].length > max) throw new ReviewError(`ข้อความต้องมี ${min}–${max} ตัวอักษร`);
  return body;
};

/** A member may send 3 reviews a day; each waits for moderation. */
export async function submitReview(db: SqlClient, userId: string, tapeId: string, rating: number, rawBody: string) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ReviewError('ให้คะแนน 1–5 ดาว');
  const body = normalizeBody(rawBody, 80, 3000);
  const id = crypto.randomUUID();
  const now = Date.now();
  const changes = await insertPendingReview(db, { id, userId, tapeId, body, rating, now }, now - 86_400_000);
  if (!changes) {
    const banned = await getUserCommentBanned(db, userId);
    if (banned?.commentBanned) throw new ReviewError('บัญชีนี้ถูกระงับการส่งรีวิว', 'FORBIDDEN');
    const exists = await getVisibleTargetId(db, 'tape', tapeId);
    if (!exists) throw new ReviewError('ไม่พบเทปที่เผยแพร่', 'NOT_FOUND');
    throw new ReviewError('ส่งรีวิวซ้ำหรือถี่เกินไป');
  }
  return { id, status: 'pending' as const };
}

export type SubmissionKind = 'artist' | 'tape' | 'song';
/** A member may propose 2 corrections an hour and 5 a day; each waits for moderation. */
export async function submitCorrection(db: SqlClient, userId: string, targetKind: SubmissionKind, targetId: string, rawChange: string, rawSourceUrl?: string | null) {
  const proposedChange = normalizeBody(rawChange, 20, 2000);
  let sourceUrl: string | null = null;
  try { sourceUrl = rawSourceUrl?.trim() ? validateSourceUrl(rawSourceUrl.trim()) : null; }
  catch { throw new ReviewError('ลิงก์อ้างอิงต้องเป็น https สาธารณะ'); }
  const id = crypto.randomUUID();
  const now = Date.now();
  const changes = await insertPendingCorrection(db, { id, userId, targetKind, targetId, proposedChange, sourceUrl, now }, now - 3_600_000, now - 86_400_000);
  if (!changes) {
    const banned = await getUserCommentBanned(db, userId);
    if (banned?.commentBanned) throw new ReviewError('บัญชีนี้ถูกระงับการเสนอแก้ข้อมูล', 'FORBIDDEN');
    throw new ReviewError('ไม่พบรายการหรือส่งถี่เกินไป');
  }
  return { id, status: 'pending' as const };
}

export async function moderateReview(db: SqlClient, adminId: string, id: string, status: 'published' | 'rejected') {
  const changes = await setPendingReviewStatus(db, id, status, adminId, Date.now());
  if (!changes) throw new ReviewError('ไม่พบรีวิวที่รอตรวจ', 'NOT_FOUND');
  return { id, status };
}

export async function moderateCorrection(db: SqlClient, adminId: string, id: string, status: 'accepted' | 'rejected') {
  const changes = await setPendingCorrectionStatus(db, id, status, adminId, Date.now());
  if (!changes) throw new ReviewError('ไม่พบข้อเสนอที่รอตรวจ', 'NOT_FOUND');
  return { id, status };
}
