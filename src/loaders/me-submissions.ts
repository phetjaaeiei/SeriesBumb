import type { SqlClient } from '../db/sql-client';
import type { SessionUser } from '../domain/types';
import { listUserCorrections, listUserReviews, type UserCorrectionRow, type UserReviewRow } from '../repositories/community.repo';

export type { UserCorrectionRow, UserReviewRow };

export interface MeSubmissionsModel {
  /** The member's 50 newest reviews in any status. */
  reviews: UserReviewRow[];
  /** The member's 50 newest catalog corrections in any status. */
  corrections: UserCorrectionRow[];
}

/** The signed-in member's /me/submissions page. */
export async function loadMeSubmissions(sql: SqlClient, viewer: Pick<SessionUser, 'id'>): Promise<MeSubmissionsModel> {
  const userId = viewer.id;
  const [reviews, corrections] = await Promise.all([
    listUserReviews(sql, userId),
    listUserCorrections(sql, userId),
  ]);
  return { reviews, corrections };
}
