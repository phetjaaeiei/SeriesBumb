import type { SqlClient } from '../../db/sql-client';
import { listRecentComments, type RecentCommentRow } from '../../repositories/community.repo';
import { countSearchQueue } from '../../repositories/search.repo';
import { getSiteStatsWithDatabaseSize, type SiteStatsRow } from '../../repositories/stats.repo';
import { listOldestDraftTapes, type DraftTapeRow } from '../../repositories/tapes.repo';

export type { DraftTapeRow, RecentCommentRow, SiteStatsRow };

export interface AdminDashboardModel {
  stats: SiteStatsRow | null;
  /** D1's reported database size, or null when the read did not report one. */
  dbBytes: number | null;
  pendingReindex: number;
  recentComments: RecentCommentRow[];
  draftTapes: DraftTapeRow[];
  /** A read failed; every other field keeps its empty default. */
  loadError: boolean;
}

/** The admin dashboard: site counters, database size, reindex queue, newest comments and oldest drafts. Never throws on a D1 failure. */
export async function loadAdminDashboard(sql: SqlClient): Promise<AdminDashboardModel> {
  let stats: SiteStatsRow | null = null;
  let dbBytes: number | null = null;
  let pendingReindex = 0;
  let recentComments: RecentCommentRow[] = [];
  let draftTapes: DraftTapeRow[] = [];
  let loadError = false;
  try {
    const [statsResult, queueCount, commentsResult, draftsResult] = await Promise.all([
      getSiteStatsWithDatabaseSize(sql),
      countSearchQueue(sql),
      listRecentComments(sql),
      listOldestDraftTapes(sql),
    ]);
    stats = statsResult.stats;
    dbBytes = statsResult.dbBytes;
    pendingReindex = queueCount;
    recentComments = commentsResult;
    draftTapes = draftsResult;
  } catch (error) {
    loadError = true;
    console.error('Admin dashboard could not load', error instanceof Error ? error.message : 'unknown');
  }
  return { stats, dbBytes, pendingReindex, recentComments, draftTapes, loadError };
}
