import type { SqlClient } from '../db/sql-client';
import { decodeCursor, encodeCursor } from '../domain/cursor';
import { isProvince } from '../domain/provinces';
import { CATALOG_LETTERS } from '../domain/thai';
import { getFirstVisibleArtistNameSort, listVisibleArtists, type ArtistListRow } from '../repositories/artists.repo';

export type { ArtistListRow };

export interface ArtistsModel {
  /** A known province from `?province=`; when set, letters are not used. */
  province: string | null;
  /** The requested catalog letter, else the first visible artist's letter; null with a province. */
  letter: string | null;
  artists: ArtistListRow[];
  next: string | null;
}

/** The /artists listing: by province, else by letter (defaulting to the first visible artist's), 50 per page. */
export async function loadArtists(sql: SqlClient, params: URLSearchParams): Promise<ArtistsModel> {
  const rawProvince = params.get('province');
  const province = rawProvince && isProvince(rawProvince) ? rawProvince : null;
  const letters = CATALOG_LETTERS;
  const defaultLetter = province ? null : await getFirstVisibleArtistNameSort(sql);
  const requested = params.get('l');
  const letter = province ? null : requested && letters.includes(requested) ? requested : defaultLetter?.nameSort.slice(1, 2) ?? null;
  const cursor = decodeCursor('title', params.get('cursor'));
  const rows = await listVisibleArtists(sql, { province, letter, cursor });
  const hasMore = rows.length > 50;
  const artists = rows.slice(0, 50);
  const last = artists.at(-1);
  const next = hasMore && last ? encodeCursor('title', last.nameSort, last.id) : null;
  return { province, letter, artists, next };
}
