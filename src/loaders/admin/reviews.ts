import type { SqlClient } from '../../db/sql-client';
import { listPendingCorrections, listPendingReviews, type PendingCorrectionRow, type PendingReviewRow } from '../../repositories/community.repo';

export type { PendingCorrectionRow, PendingReviewRow };

export interface AdminReviewsModel {
  reviews: PendingReviewRow[];
  corrections: PendingCorrectionRow[];
}

/** `/admin/reviews`: the oldest 50 pending reviews and 50 pending catalog corrections. */
export async function loadAdminReviews(sql: SqlClient): Promise<AdminReviewsModel> {
  const [reviews, corrections] = await Promise.all([
    listPendingReviews(sql),
    listPendingCorrections(sql),
  ]);
  return { reviews, corrections };
}
