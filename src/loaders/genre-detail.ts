import type { SqlClient } from '../db/sql-client';
import { getGenreBySlug, type GenreSummary } from '../repositories/genres.repo';
import { getTapePage, type TapeListItem } from '../repositories/tapes.repo';

export type { GenreSummary };

export interface GenreDetailModel {
  genre: GenreSummary;
  /** One page of published tapes in the genre from `?cursor=`. */
  page: { items: TapeListItem[]; nextCursor: string | null };
}

/** A genre page. null when not found. */
export async function loadGenreDetail(sql: SqlClient, slug: string, params: URLSearchParams): Promise<GenreDetailModel | null> {
  const genre = await getGenreBySlug(sql, slug);
  if (!genre) return null;
  const page = await getTapePage(sql, { genreId: genre.id, cursor: params.get('cursor') });
  return { genre, page };
}
