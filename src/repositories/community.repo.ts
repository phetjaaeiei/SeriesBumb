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

// Visibility of the tapes and songs members can comment on, like or own.
const VISIBLE = { tape: "status = 'published'", song: '(isPublic = 1 OR publishedTapeCount > 0)' } as const;

/** `{ id }` when the tape is published or the song is public or on a published tape, or null. */
export async function getVisibleTargetId(sql: SqlClient, table: 'tape' | 'song', id: string): Promise<{ id: string } | null> {
  return sql.prepare(`SELECT id FROM ${table} WHERE id = ? AND ${VISIBLE[table]}`).bind(id).first<{ id: string }>();
}

// ---- Comments

export type CommentTarget = { tapeId: string; songId?: never } | { songId: string; tapeId?: never };

function commentTarget(target: CommentTarget) {
  return target.tapeId
    ? { column: 'tapeId' as const, id: target.tapeId, table: 'tape' as const }
    : { column: 'songId' as const, id: target.songId!, table: 'song' as const };
}

/** `{ id }` when the comment's tape or song is visible, or null. */
export async function getVisibleCommentTarget(sql: SqlClient, target: CommentTarget): Promise<{ id: string } | null> {
  const config = commentTarget(target);
  return getVisibleTargetId(sql, config.table, config.id);
}

export interface CommentRow { id: string; body: string; createdAt: number; userId: string; name: string; image: string | null }

/** Up to 21 live comments on the tape or song, newest first, after `cursor` (one more than a page). */
export async function listCommentRows(sql: SqlClient, target: CommentTarget, cursor: { key: CursorKey; id: string } | null): Promise<CommentRow[]> {
  const config = commentTarget(target);
  const paging = cursor ? 'AND (c.createdAt, c.id) < (?, ?)' : '';
  const query = `SELECT c.id, c.body, c.createdAt, c.userId, u.name, u.image FROM comment c JOIN user u ON u.id = c.userId
    WHERE c.${config.column} = ? AND c.deletedAt IS NULL ${paging} ORDER BY c.createdAt DESC, c.id DESC LIMIT 21`;
  return (await sql.prepare(query).bind(config.id, ...(cursor ? [cursor.key, cursor.id] : [])).all<CommentRow>()).results;
}

/**
 * Inserts the comment when the author is not banned, the target is visible and, when `rateWindows` is
 * given, the author wrote fewer than 5 comments since `minuteSince` and 50 since `daySince`.
 * Returns the number of rows written (0 when a guard refused it).
 */
export async function insertCommentIfAllowed(sql: SqlClient, comment: { id: string; userId: string; target: CommentTarget; body: string; now: number }, rateWindows: { minuteSince: number; daySince: number } | null): Promise<number> {
  const { id, userId, target, body, now } = comment;
  const config = commentTarget(target);
  const rateWhere = !rateWindows ? '' : `AND (SELECT COUNT(*) FROM comment WHERE userId = ? AND createdAt > ?) < 5
    AND (SELECT COUNT(*) FROM comment WHERE userId = ? AND createdAt > ?) < 50`;
  const insert = sql.prepare(`INSERT INTO comment (id, userId, tapeId, songId, body, createdAt)
    SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT commentBanned FROM user WHERE id = ?) = 0 ${rateWhere}
      AND EXISTS (SELECT 1 FROM ${config.table} WHERE id = ? AND ${VISIBLE[config.table]})`);
  const binds: (string | number | null)[] = [id, userId, target.tapeId || null, target.songId || null, body, now, userId];
  if (rateWindows) binds.push(userId, rateWindows.minuteSince, userId, rateWindows.daySince);
  binds.push(config.id);
  const result = await insert.bind(...binds).run();
  return result.meta.changes;
}

/** Recounts the live comments of the tape or song into its commentCount. */
export async function refreshCommentCount(sql: SqlClient, target: CommentTarget): Promise<void> {
  const config = commentTarget(target);
  await sql.prepare(`UPDATE ${config.table} SET commentCount = (SELECT COUNT(*) FROM comment WHERE ${config.column} = ? AND deletedAt IS NULL) WHERE id = ?`).bind(config.id, config.id).run();
}

/** One comment with its author's name and image, or null. */
export async function getCommentRow(sql: SqlClient, id: string): Promise<CommentRow | null> {
  return sql.prepare('SELECT c.id, c.body, c.createdAt, c.userId, u.name, u.image FROM comment c JOIN user u ON u.id = c.userId WHERE c.id = ?').bind(id).first<CommentRow>();
}

/** The tape or song of the user's own live comment, or null. */
export async function getOwnLiveCommentTarget(sql: SqlClient, commentId: string, userId: string): Promise<{ tapeId: string | null; songId: string | null } | null> {
  return sql.prepare('SELECT tapeId, songId FROM comment WHERE id = ? AND userId = ? AND deletedAt IS NULL').bind(commentId, userId).first<{ tapeId: string | null; songId: string | null }>();
}

/** Soft-deletes the user's own live comment; returns the number of rows changed. */
export async function softDeleteOwnComment(sql: SqlClient, commentId: string, userId: string, now: number): Promise<number> {
  return (await sql.prepare('UPDATE comment SET deletedAt = ?, deletedBy = ?, deletedByAdmin = 0 WHERE id = ? AND userId = ? AND deletedAt IS NULL').bind(now, userId, commentId, userId).run()).meta.changes;
}

export interface CommentModerationRow { id: string; tapeId: string | null; songId: string | null; deletedAt: number | null; deletedByAdmin: number }

/** A comment's target and deletion state, for moderating it, or null. */
export async function getCommentForModeration(sql: SqlClient, commentId: string): Promise<CommentModerationRow | null> {
  return sql.prepare('SELECT id, tapeId, songId, deletedAt, deletedByAdmin FROM comment WHERE id = ?').bind(commentId).first<CommentModerationRow>();
}

/** Restores a comment an admin deleted; returns the number of rows changed. */
export async function restoreAdminDeletedComment(sql: SqlClient, commentId: string): Promise<number> {
  return (await sql.prepare('UPDATE comment SET deletedAt = NULL, deletedBy = NULL, deletedByAdmin = 0 WHERE id = ? AND deletedAt IS NOT NULL AND deletedByAdmin = 1').bind(commentId).run()).meta.changes;
}

/** Soft-deletes a live comment as an admin; returns the number of rows changed. */
export async function adminDeleteComment(sql: SqlClient, commentId: string, adminId: string, now: number): Promise<number> {
  return (await sql.prepare('UPDATE comment SET deletedAt = ?, deletedBy = ?, deletedByAdmin = 1 WHERE id = ? AND deletedAt IS NULL').bind(now, adminId, commentId).run()).meta.changes;
}

// ---- Reviews and catalog corrections

/**
 * Inserts a pending review when the tape is published, the author is not banned and wrote fewer than
 * 3 reviews since `daySince` (a repeat review of the same tape is ignored). Returns the rows written.
 */
export async function insertPendingReview(sql: SqlClient, review: { id: string; userId: string; tapeId: string; body: string; rating: number; now: number }, daySince: number): Promise<number> {
  const { id, userId, tapeId, body, rating, now } = review;
  return (await sql.prepare(`INSERT OR IGNORE INTO review (id, userId, tapeId, body, rating, status, createdAt)
    SELECT ?, ?, ?, ?, ?, 'pending', ? WHERE EXISTS (SELECT 1 FROM tape WHERE id = ? AND status = 'published')
      AND EXISTS (SELECT 1 FROM user WHERE id = ? AND commentBanned = 0)
      AND (SELECT COUNT(*) FROM review WHERE userId = ? AND createdAt > ?) < 3`)
    .bind(id, userId, tapeId, body, rating, now, tapeId, userId, userId, daySince).run()).meta.changes;
}

export type CorrectionTargetKind = 'artist' | 'tape' | 'song';

export interface CorrectionInsert { id: string; userId: string; targetKind: CorrectionTargetKind; targetId: string; proposedChange: string; sourceUrl: string | null; now: number }

/**
 * Inserts a pending correction when the target is visible, the author is not banned and sent fewer than
 * 2 since `hourSince` and 5 since `daySince`. Returns the rows written.
 */
export async function insertPendingCorrection(sql: SqlClient, correction: CorrectionInsert, hourSince: number, daySince: number): Promise<number> {
  const { id, userId, targetKind, targetId, proposedChange, sourceUrl, now } = correction;
  const table = targetKind === 'artist' ? 'artist' : targetKind === 'tape' ? 'tape' : 'song';
  const visible = targetKind === 'artist' ? "(publishedTapeCount > 0 OR EXISTS (SELECT 1 FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = artist.id AND s.isPublic = 1))" : targetKind === 'tape' ? "status = 'published'" : 'isPublic = 1';
  return (await sql.prepare(`INSERT INTO catalog_submission (id, userId, targetKind, targetId, proposedChange, sourceUrl, status, createdAt)
    SELECT ?, ?, ?, ?, ?, ?, 'pending', ? WHERE EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND ${visible})
      AND EXISTS (SELECT 1 FROM user WHERE id = ? AND commentBanned = 0)
      AND (SELECT COUNT(*) FROM catalog_submission WHERE userId = ? AND createdAt > ?) < 2
      AND (SELECT COUNT(*) FROM catalog_submission WHERE userId = ? AND createdAt > ?) < 5`)
    .bind(id, userId, targetKind, targetId, proposedChange, sourceUrl, now, targetId, userId, userId, hourSince, userId, daySince).run()).meta.changes;
}

/** Publishes or rejects a pending review; returns the number of rows changed. */
export async function setPendingReviewStatus(sql: SqlClient, id: string, status: 'published' | 'rejected', adminId: string, now: number): Promise<number> {
  return (await sql.prepare("UPDATE review SET status = ?, reviewedAt = ?, reviewedBy = ? WHERE id = ? AND status = 'pending'").bind(status, now, adminId, id).run()).meta.changes;
}

/** Accepts or rejects a pending correction; returns the number of rows changed. */
export async function setPendingCorrectionStatus(sql: SqlClient, id: string, status: 'accepted' | 'rejected', adminId: string, now: number): Promise<number> {
  return (await sql.prepare("UPDATE catalog_submission SET status = ?, reviewedAt = ?, reviewedBy = ? WHERE id = ? AND status = 'pending'").bind(status, now, adminId, id).run()).meta.changes;
}

// ---- Likes and ownership

export type EngagementKind = 'tapeLike' | 'songLike' | 'tapeOwned';

const engagementTables = {
  tapeLike: { table: 'tape_like', targetTable: 'tape', idColumn: 'tapeId', countColumn: 'likeCount' },
  songLike: { table: 'song_like', targetTable: 'song', idColumn: 'songId', countColumn: 'likeCount' },
  tapeOwned: { table: 'tape_owner', targetTable: 'tape', idColumn: 'tapeId', countColumn: 'ownerCount' },
} as const;

/** `{ id }` when the liked or owned tape or song is visible, or null. */
export async function getVisibleEngagementTarget(sql: SqlClient, kind: EngagementKind, targetId: string): Promise<{ id: string } | null> {
  return getVisibleTargetId(sql, engagementTables[kind].targetTable, targetId);
}

/**
 * Adds (`value` true) or removes the user's like or ownership and adjusts the target's counter in one
 * atomic batch. The counter UPDATE matches no row unless the like/owner row really changed, so repeated
 * clicks cost no counter writes. Returns whether the row changed and the counter afterwards.
 */
export async function writeEngagement(sql: SqlClient, kind: EngagementKind, userId: string, targetId: string, value: boolean, now: number): Promise<{ changed: boolean; count: number | undefined }> {
  const { table, targetTable, idColumn, countColumn } = engagementTables[kind];
  const write = value
    ? sql.prepare(`INSERT OR IGNORE INTO ${table} (userId, ${idColumn}, createdAt) VALUES (?, ?, ?)`).bind(userId, targetId, now)
    : sql.prepare(`DELETE FROM ${table} WHERE userId = ? AND ${idColumn} = ?`).bind(userId, targetId);
  const result = await sql.batch([
    write,
    sql.prepare(`UPDATE ${targetTable} SET ${countColumn} = MAX(0, ${countColumn} ${value ? '+' : '-'} 1) WHERE id = ? AND changes() > 0`).bind(targetId),
    sql.prepare(`SELECT ${countColumn} AS count FROM ${targetTable} WHERE id = ?`).bind(targetId),
  ]);
  return { changed: (result[0].meta.changes ?? 0) > 0, count: (result[2].results[0] as { count: number } | undefined)?.count };
}
