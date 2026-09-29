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

export interface RecentCommentRow {
  id: string;
  body: string;
  createdAt: number;
  deletedAt: number | null;
  authorName: string;
  tapeSlug: string | null;
  tapeTitle: string | null;
  songSlug: string | null;
  songTitle: string | null;
}

/** The ten newest comments in any state, with the author and the tape or song they are on. */
export async function listRecentComments(sql: SqlClient): Promise<RecentCommentRow[]> {
  return (await sql.prepare(`SELECT c.id, c.body, c.createdAt, c.deletedAt, u.name AS authorName,
      t.slug AS tapeSlug, t.title AS tapeTitle, s.slug AS songSlug, s.title AS songTitle
      FROM comment c JOIN user u ON u.id = c.userId
      LEFT JOIN tape t ON t.id = c.tapeId LEFT JOIN song s ON s.id = c.songId
      ORDER BY c.createdAt DESC, c.id DESC LIMIT 10`).all<RecentCommentRow>()).results;
}

export interface AdminCommentListRow {
  id: string;
  body: string;
  createdAt: number;
  deletedAt: number | null;
  deletedByAdmin: number;
  authorName: string;
  authorEmail: string;
  tapeSlug: string | null;
  tapeTitle: string | null;
  songSlug: string | null;
  songTitle: string | null;
}

/** Up to 51 comments in any state, newest first, after `cursor`, only on tapes or songs when `kind` says so. */
export async function listAdminComments(sql: SqlClient, kind: 'all' | 'tape' | 'song', cursor: { key: CursorKey; id: string } | null): Promise<AdminCommentListRow[]> {
  const kindWhere = kind === 'tape' ? 'AND c.tapeId IS NOT NULL' : kind === 'song' ? 'AND c.songId IS NOT NULL' : '';
  const page = cursor ? 'AND (c.createdAt, c.id) < (?, ?)' : '';
  return (await sql.prepare(`SELECT c.id, c.body, c.createdAt, c.deletedAt, c.deletedByAdmin, u.name AS authorName, u.email AS authorEmail,
  t.slug AS tapeSlug, t.title AS tapeTitle, s.slug AS songSlug, s.title AS songTitle
  FROM comment c JOIN user u ON u.id = c.userId LEFT JOIN tape t ON t.id = c.tapeId LEFT JOIN song s ON s.id = c.songId
  WHERE 1 = 1 ${kindWhere} ${page}
  ORDER BY c.createdAt DESC, c.id DESC LIMIT 51`).bind(...(cursor ? [cursor.key, cursor.id] : [])).all<AdminCommentListRow>()).results;
}

export interface PendingReviewRow { id: string; body: string; rating: number; authorName: string; tapeTitle: string; tapeSlug: string }

/** The 50 oldest reviews waiting for moderation, with author and tape. */
export async function listPendingReviews(sql: SqlClient): Promise<PendingReviewRow[]> {
  return (await sql.prepare("SELECT r.id, r.body, r.rating, u.name AS authorName, t.title AS tapeTitle, t.slug AS tapeSlug FROM review r JOIN user u ON u.id = r.userId JOIN tape t ON t.id = r.tapeId WHERE r.status = 'pending' ORDER BY r.createdAt, r.id LIMIT 50").all<PendingReviewRow>()).results;
}

export interface PendingCorrectionRow { id: string; proposedChange: string; sourceUrl: string | null; authorName: string; targetKind: string; targetTitle: string }

/** The 50 oldest catalog corrections waiting for moderation, titled by their target (or a deleted-record label). */
export async function listPendingCorrections(sql: SqlClient): Promise<PendingCorrectionRow[]> {
  return (await sql.prepare("SELECT cs.id, cs.proposedChange, cs.sourceUrl, u.name AS authorName, cs.targetKind, COALESCE(a.name, t.title, s.title, 'รายการถูกลบ') AS targetTitle FROM catalog_submission cs JOIN user u ON u.id = cs.userId LEFT JOIN artist a ON cs.targetKind = 'artist' AND a.id = cs.targetId LEFT JOIN tape t ON cs.targetKind = 'tape' AND t.id = cs.targetId LEFT JOIN song s ON cs.targetKind = 'song' AND s.id = cs.targetId WHERE cs.status = 'pending' ORDER BY cs.createdAt, cs.id LIMIT 50").all<PendingCorrectionRow>()).results;
}
