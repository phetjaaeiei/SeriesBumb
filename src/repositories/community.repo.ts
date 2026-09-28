import type { SqlClient } from '../db/sql-client';

export interface PublishedReview { id: string; body: string; rating: number; createdAt: number; authorName: string }

/** The twenty newest published reviews of a tape. */
export async function listPublishedTapeReviews(sql: SqlClient, tapeId: string): Promise<PublishedReview[]> {
  return (await sql.prepare("SELECT r.id, r.body, r.rating, r.createdAt, u.name AS authorName FROM review r JOIN user u ON u.id = r.userId WHERE r.tapeId = ? AND r.status = 'published' ORDER BY r.createdAt DESC, r.id DESC LIMIT 20").bind(tapeId).all<PublishedReview>()).results;
}
