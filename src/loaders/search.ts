import type { SqlClient } from '../db/sql-client';
import { searchPublic, type SearchResult } from '../repositories/search.repo';

export type { SearchResult };

export interface SearchModel {
  /** The trimmed query, at most 100 characters ('' when absent). */
  q: string;
  /** Public matches grouped by kind; [] without a query. */
  results: SearchResult[];
}

/** The /search page's quick search over tapes, songs, artists, labels and collections. */
export async function loadSearch(sql: SqlClient, params: URLSearchParams): Promise<SearchModel> {
  const q = params.get('q')?.trim().slice(0, 100) ?? '';
  const results = q ? await searchPublic(sql, q) : [];
  return { q, results };
}
