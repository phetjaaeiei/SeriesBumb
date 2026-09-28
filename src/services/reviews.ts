import { normalizeComment } from './comments';
import { validateSourceUrl } from './catalog-sources';

export class ReviewError extends Error {
  constructor(message: string, public code: 'BAD_REQUEST' | 'NOT_FOUND' | 'FORBIDDEN' = 'BAD_REQUEST') { super(message); }
}

const normalizeBody = (raw: string, min: number, max: number) => {
  const body = normalizeComment(raw);
  if ([...body].length < min || [...body].length > max) throw new ReviewError(`ข้อความต้องมี ${min}–${max} ตัวอักษร`);
  return body;
};

export async function submitReview(db: D1Database, userId: string, tapeId: string, rating: number, rawBody: string) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ReviewError('ให้คะแนน 1–5 ดาว');
  const body = normalizeBody(rawBody, 80, 3000);
  const id = crypto.randomUUID();
  const now = Date.now();
  const result = await db.prepare(`INSERT OR IGNORE INTO review (id, userId, tapeId, body, rating, status, createdAt)
    SELECT ?, ?, ?, ?, ?, 'pending', ? WHERE EXISTS (SELECT 1 FROM tape WHERE id = ? AND status = 'published')
      AND EXISTS (SELECT 1 FROM user WHERE id = ? AND commentBanned = 0)
      AND (SELECT COUNT(*) FROM review WHERE userId = ? AND createdAt > ?) < 3`)
    .bind(id, userId, tapeId, body, rating, now, tapeId, userId, userId, now - 86_400_000).run();
  if (!result.meta.changes) {
    const banned = await db.prepare('SELECT commentBanned FROM user WHERE id = ?').bind(userId).first<{ commentBanned: number }>();
    if (banned?.commentBanned) throw new ReviewError('บัญชีนี้ถูกระงับการส่งรีวิว', 'FORBIDDEN');
    const exists = await db.prepare("SELECT id FROM tape WHERE id = ? AND status = 'published'").bind(tapeId).first();
    if (!exists) throw new ReviewError('ไม่พบเทปที่เผยแพร่', 'NOT_FOUND');
    throw new ReviewError('ส่งรีวิวซ้ำหรือถี่เกินไป');
  }
  return { id, status: 'pending' as const };
}

export type SubmissionKind = 'artist' | 'tape' | 'song';
export async function submitCorrection(db: D1Database, userId: string, targetKind: SubmissionKind, targetId: string, rawChange: string, rawSourceUrl?: string | null) {
  const proposedChange = normalizeBody(rawChange, 20, 2000);
  let sourceUrl: string | null = null;
  try { sourceUrl = rawSourceUrl?.trim() ? validateSourceUrl(rawSourceUrl.trim()) : null; }
  catch { throw new ReviewError('ลิงก์อ้างอิงต้องเป็น https สาธารณะ'); }
  const table = targetKind === 'artist' ? 'artist' : targetKind === 'tape' ? 'tape' : 'song';
  const visible = targetKind === 'artist' ? "(publishedTapeCount > 0 OR EXISTS (SELECT 1 FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = artist.id AND s.isPublic = 1))" : targetKind === 'tape' ? "status = 'published'" : 'isPublic = 1';
  const id = crypto.randomUUID();
  const now = Date.now();
  const result = await db.prepare(`INSERT INTO catalog_submission (id, userId, targetKind, targetId, proposedChange, sourceUrl, status, createdAt)
    SELECT ?, ?, ?, ?, ?, ?, 'pending', ? WHERE EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND ${visible})
      AND EXISTS (SELECT 1 FROM user WHERE id = ? AND commentBanned = 0)
      AND (SELECT COUNT(*) FROM catalog_submission WHERE userId = ? AND createdAt > ?) < 2
      AND (SELECT COUNT(*) FROM catalog_submission WHERE userId = ? AND createdAt > ?) < 5`)
    .bind(id, userId, targetKind, targetId, proposedChange, sourceUrl, now, targetId, userId, userId, now - 3_600_000, userId, now - 86_400_000).run();
  if (!result.meta.changes) {
    const banned = await db.prepare('SELECT commentBanned FROM user WHERE id = ?').bind(userId).first<{ commentBanned: number }>();
    if (banned?.commentBanned) throw new ReviewError('บัญชีนี้ถูกระงับการเสนอแก้ข้อมูล', 'FORBIDDEN');
    throw new ReviewError('ไม่พบรายการหรือส่งถี่เกินไป');
  }
  return { id, status: 'pending' as const };
}

export async function moderateReview(db: D1Database, adminId: string, id: string, status: 'published' | 'rejected') {
  const result = await db.prepare("UPDATE review SET status = ?, reviewedAt = ?, reviewedBy = ? WHERE id = ? AND status = 'pending'").bind(status, Date.now(), adminId, id).run();
  if (!result.meta.changes) throw new ReviewError('ไม่พบรีวิวที่รอตรวจ', 'NOT_FOUND');
  return { id, status };
}

export async function moderateCorrection(db: D1Database, adminId: string, id: string, status: 'accepted' | 'rejected') {
  const result = await db.prepare("UPDATE catalog_submission SET status = ?, reviewedAt = ?, reviewedBy = ? WHERE id = ? AND status = 'pending'").bind(status, Date.now(), adminId, id).run();
  if (!result.meta.changes) throw new ReviewError('ไม่พบข้อเสนอที่รอตรวจ', 'NOT_FOUND');
  return { id, status };
}
