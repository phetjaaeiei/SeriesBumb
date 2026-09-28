import type { SqlClient } from '../db/sql-client';
import { decodeCursor, encodeCursor } from '../domain/cursor';
import { listVisibleSongsByTitle, type SongListRow } from '../repositories/songs.repo';

export type { SongListRow };

export interface SongsModel {
  /** Whether `?cursor=` held a valid cursor (later pages are not indexed). */
  hasCursor: boolean;
  /** One page of up to 50 guest-visible songs by title. */
  songs: SongListRow[];
  next: string | null;
}

/** The /songs listing: 50 guest-visible songs per page by title. */
export async function loadSongs(sql: SqlClient, params: URLSearchParams): Promise<SongsModel> {
  const cursor = decodeCursor('title', params.get('cursor'));
  const rows = await listVisibleSongsByTitle(sql, cursor);
  const songs = rows.slice(0, 50);
  const last = songs.at(-1);
  const next = rows.length > 50 && last ? encodeCursor('title', last.titleSort, last.id) : null;
  return { hasCursor: Boolean(cursor), songs, next };
}
