import type { SqlClient } from '../db/sql-client';
import { listFeaturedCollections, type CollectionLink } from '../repositories/collections.repo';
import { countVisibleSongs, listRecentVisibleSongs, type SongLink } from '../repositories/songs.repo';
import { getPublishedTapeCountRow } from '../repositories/stats.repo';
import { getTapeHighlights, getTapePage, type TapeListItem } from '../repositories/tapes.repo';

export interface HomeModel {
  /** null when the stats row could not be read (e.g. a local database that is not migrated yet). */
  publishedTapeCount: number | null;
  publicSongCount: number;
  recent: { items: TapeListItem[]; nextCursor: string | null } | null;
  updated: TapeListItem[];
  owned: TapeListItem[];
  featured: CollectionLink[];
  recentSongs: SongLink[];
}

export async function loadHome(sql: SqlClient): Promise<HomeModel> {
  let publishedTapeCount: number | null = null;
  let publicSongCount = 0;
  try {
    const row = await getPublishedTapeCountRow(sql);
    publishedTapeCount = row?.publishedTapeCount ?? 0;
    publicSongCount = await countVisibleSongs(sql);
  } catch {
    // The shell also renders before a local database has been migrated.
  }
  const recent = publishedTapeCount ? await getTapePage(sql, { pageSize: 10 }) : null;
  const [updated, owned, featured] = publishedTapeCount ? await Promise.all([
    getTapeHighlights(sql, 'updated', 10),
    getTapeHighlights(sql, 'owned', 10),
    listFeaturedCollections(sql),
  ]) : [[], [], [] as CollectionLink[]];
  const recentSongs = publishedTapeCount === 0 && publicSongCount > 0 ? await listRecentVisibleSongs(sql) : [];
  return { publishedTapeCount, publicSongCount, recent, updated, owned, featured, recentSongs };
}
