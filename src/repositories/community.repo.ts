import type { SqlClient } from '../db/sql-client';
import type { CursorKey } from '../domain/cursor';

export interface PublishedReview { id: string; body: string; rating: number; createdAt: number; authorName: string }

/** The twenty newest published reviews of a tape. */
export async function listPublishedTapeReviews(sql: SqlClient, tapeId: string): Promise<PublishedReview[]> {
  return (await sql.prepare("SELECT r.id, r.body, r.rating, r.createdAt, u.name AS authorName FROM review r JOIN user u ON u.id = r.userId WHERE r.tapeId = ? AND r.status = 'published' ORDER BY r.createdAt DESC, r.id DESC LIMIT 20").bind(tapeId).all<PublishedReview>()).results;
}

export interface ReviewFeedRow { id: string; body: string; rating: number; createdAt: number; slug: string; title: string; authorName: string }

/** Up to 21 published reviews of published tapes, newest first, after `cursor` (one more than a page). */
export async function listPublishedReviewFeed(sql: SqlClient, cursor: { key: CursorKey; id: string } | null): Promise<ReviewFeedRow[]> {
  return (await sql.prepare(`SELECT r.id, r.body, r.rating, r.createdAt, t.slug, t.title, u.name AS authorName FROM review r JOIN tape t ON t.id = r.tapeId JOIN user u ON u.id = r.userId WHERE r.status = 'published' AND t.status = 'published' ${cursor ? 'AND (r.createdAt, r.id) < (?, ?)' : ''} ORDER BY r.createdAt DESC, r.id DESC LIMIT 21`).bind(...(cursor ? [cursor.key, cursor.id] : [])).all<ReviewFeedRow>()).results;
}

export interface UserReviewRow { id: string; status: string; rating: number; createdAt: number; title: string; slug: string }

/** The user's 50 newest reviews in any status, with the tape's title and slug. */
export async function listUserReviews(sql: SqlClient, userId: string): Promise<UserReviewRow[]> {
  return (await sql.prepare('SELECT r.id, r.status, r.rating, r.createdAt, t.title, t.slug FROM review r JOIN tape t ON t.id = r.tapeId WHERE r.userId = ? ORDER BY r.createdAt DESC LIMIT 50').bind(userId).all<UserReviewRow>()).results;
}

export interface UserCorrectionRow { id: string; status: string; proposedChange: string; createdAt: number; title: string }

/** The user's 50 newest catalog corrections in any status, titled by their target (or a deleted-record label). */
export async function listUserCorrections(sql: SqlClient, userId: string): Promise<UserCorrectionRow[]> {
  return (await sql.prepare("SELECT cs.id, cs.status, cs.proposedChange, cs.createdAt, COALESCE(a.name, t.title, s.title, 'รายการถูกลบ') AS title FROM catalog_submission cs LEFT JOIN artist a ON cs.targetKind = 'artist' AND a.id = cs.targetId LEFT JOIN tape t ON cs.targetKind = 'tape' AND t.id = cs.targetId LEFT JOIN song s ON cs.targetKind = 'song' AND s.id = cs.targetId WHERE cs.userId = ? ORDER BY cs.createdAt DESC LIMIT 50").bind(userId).all<UserCorrectionRow>()).results;
}
