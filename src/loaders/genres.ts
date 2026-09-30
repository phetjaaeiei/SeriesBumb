import type { SqlClient } from '../db/sql-client';
import { listGenres, type GenreListRow } from '../repositories/genres.repo';

export type { GenreListRow };

export interface GenresModel { genres: GenreListRow[] }

/** The /genres listing: every genre in display order. */
export async function loadGenres(sql: SqlClient): Promise<GenresModel> {
  return { genres: await listGenres(sql) };
}
