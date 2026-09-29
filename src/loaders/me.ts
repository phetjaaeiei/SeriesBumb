import type { SqlClient } from '../db/sql-client';
import { decodeCursor, encodeCursor, type CursorKey } from '../domain/cursor';
import type { SessionUser } from '../domain/types';
import { listUserLikedSongs, type UserSongEntry } from '../repositories/songs.repo';
import { listUserTapeEntries, type UserTapeEntry } from '../repositories/tapes.repo';

export type { UserSongEntry, UserTapeEntry };

export type MeTab = 'liked-tapes' | 'liked-songs' | 'owned';

export interface SavedPage<T> { items: T[]; next: string | null }

export interface MeModel {
  /** The tab `?cursor=` pages; the other tabs show their first page. */
  activeTab: MeTab;
  likedTapes: SavedPage<UserTapeEntry>;
  likedSongs: SavedPage<UserSongEntry>;
  owned: SavedPage<UserTapeEntry>;
}

type PageCursor = { key: CursorKey; id: string } | null;

/** The signed-in member's /me page: liked tapes, liked songs and owned tapes, 48 per page. */
export async function loadMe(sql: SqlClient, params: URLSearchParams, viewer: Pick<SessionUser, 'id'>): Promise<MeModel> {
  const userId = viewer.id;
  const requestedTab = params.get('tab');
  const activeTab: MeTab = requestedTab === 'liked-songs' || requestedTab === 'owned' ? requestedTab : 'liked-tapes';
  const cursor = decodeCursor('new', params.get('cursor'));

  async function tapePage(table: 'tape_like' | 'tape_owner', pageCursor: PageCursor): Promise<SavedPage<UserTapeEntry>> {
    const rows = await listUserTapeEntries(sql, table, userId, pageCursor);
    const items = rows.slice(0, 48);
    const last = items.at(-1);
    return { items, next: rows.length > 48 && last ? encodeCursor('new', last.createdAt, last.id) : null };
  }

  async function songPage(pageCursor: PageCursor): Promise<SavedPage<UserSongEntry>> {
    const rows = await listUserLikedSongs(sql, userId, pageCursor);
    const items = rows.slice(0, 48);
    const last = items.at(-1);
    return { items, next: rows.length > 48 && last ? encodeCursor('new', last.createdAt, last.id) : null };
  }

  const [likedTapes, likedSongs, owned] = await Promise.all([
    tapePage('tape_like', activeTab === 'liked-tapes' ? cursor : null),
    songPage(activeTab === 'liked-songs' ? cursor : null),
    tapePage('tape_owner', activeTab === 'owned' ? cursor : null),
  ]);
  return { activeTab, likedTapes, likedSongs, owned };
}
