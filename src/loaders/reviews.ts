import type { SqlClient } from '../db/sql-client';
import { decodeCursor, encodeCursor } from '../domain/cursor';
import { listPublishedReviewFeed, type ReviewFeedRow } from '../repositories/community.repo';

export type { ReviewFeedRow };

export interface ReviewsModel {
  /** Up to 20 published reviews of published tapes, newest first. */
  items: ReviewFeedRow[];
  next: string | null;
}

/** The /reviews feed, 20 per page by `?cursor=`. */
export async function loadReviews(sql: SqlClient, params: URLSearchParams): Promise<ReviewsModel> {
  const cursor = decodeCursor('new', params.get('cursor'));
  const rows = await listPublishedReviewFeed(sql, cursor);
  const items = rows.slice(0, 20);
  const last = items.at(-1);
  const next = rows.length > 20 && last ? encodeCursor('new', last.createdAt, last.id) : null;
  return { items, next };
}
