import type { SqlClient } from '../db/sql-client';
import { parseAdvancedSearch, type AdvancedKind, type AdvancedSearchFilters } from '../domain/search';
import { listArtistFilterOptions } from '../repositories/artists.repo';
import { listGenreFilterOptions } from '../repositories/genres.repo';
import { listLabelFilterOptions } from '../repositories/labels.repo';
import { advancedSearch, type AdvancedSearchItem } from '../repositories/search.repo';

export type { AdvancedKind, AdvancedSearchFilters, AdvancedSearchItem };

export interface FilterOption { slug: string; name: string }

export interface AdvancedSearchModel {
  filters: AdvancedSearchFilters;
  /** One page (20) of matches of `filters.kind`. */
  items: AdvancedSearchItem[];
  nextCursor: string | null;
  genres: FilterOption[];
  artists: FilterOption[];
  labels: FilterOption[];
}

/** The /search/advanced page: parsed filters, one page of matches and the filter select options. */
export async function loadAdvancedSearch(sql: SqlClient, params: URLSearchParams): Promise<AdvancedSearchModel> {
  const filters = parseAdvancedSearch(params);
  const { items, nextCursor } = await advancedSearch(sql, filters);
  const genres = await listGenreFilterOptions(sql);
  const artists = await listArtistFilterOptions(sql);
  const labels = await listLabelFilterOptions(sql);
  return { filters, items, nextCursor, genres, artists, labels };
}
