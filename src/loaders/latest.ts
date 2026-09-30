import type { SqlClient } from '../db/sql-client';
import { listRecentPublicSongs, type SongLink } from '../repositories/songs.repo';
import { getTapeHighlights, getTapePage, type TapeListItem } from '../repositories/tapes.repo';

export interface LatestModel {
  recent: { items: TapeListItem[]; nextCursor: string | null };
  updated: TapeListItem[];
  recentSongs: (SongLink & { updatedAt: number })[];
}

export async function loadLatest(sql: SqlClient): Promise<LatestModel> {
  const [recent, updated] = await Promise.all([getTapePage(sql, { pageSize: 50 }), getTapeHighlights(sql, 'updated', 50)]);
  const recentSongs = await listRecentPublicSongs(sql);
  return { recent, updated, recentSongs };
}
