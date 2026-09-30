import type { SqlClient } from '../db/sql-client';
import { getVisibleEngagementTarget, writeEngagement, type EngagementKind } from '../repositories/community.repo';

export type { EngagementKind };

export async function setEngagement(db: SqlClient, userId: string, kind: EngagementKind, targetId: string, value: boolean) {
  const target = await getVisibleEngagementTarget(db, kind, targetId);
  if (!target) throw new Error('ไม่พบรายการนี้');
  const { changed, count } = await writeEngagement(db, kind, userId, targetId, value, Date.now());
  return { value, count: count ?? 0, changed };
}
