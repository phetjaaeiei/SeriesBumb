import type { SqlClient } from '../db/sql-client';
import type { CatalogSort } from '../domain/cursor';
import { RELEASE_TYPES, type ReleaseType } from '../domain/enums';
import { CATALOG_LETTERS } from '../domain/thai';
import { listGenreOptions, type GenreOption } from '../repositories/genres.repo';
import { getTapePage, type TapeListItem } from '../repositories/tapes.repo';

export type { TapeListItem };

export interface TapesModel {
  genres: GenreOption[];
  decade: number | null;
  genre: GenreOption | undefined;
  releaseType: ReleaseType | null;
  allowedSorts: CatalogSort[];
  sort: CatalogSort;
  view: 'grid' | 'table';
  showLetters: boolean;
  letter: string | null;
  page: { items: TapeListItem[]; nextCursor: string | null };
}

/** The /tapes listing: filters parsed from the query string, then one page of published tapes. */
export async function loadTapes(sql: SqlClient, params: URLSearchParams): Promise<TapesModel> {
  const decadeText = params.get('decade');
  const decade = decadeText && /^(19[5-9]|20[0-2])0s$/u.test(decadeText) ? Number(decadeText.slice(0, 4)) : null;
  const rawType = params.get('type');
  const releaseType: ReleaseType | null = RELEASE_TYPES.find(type => type === rawType) ?? null;
  const genres = await listGenreOptions(sql);
  const genre = genres.find(item => item.slug === params.get('genre'));
  const allowedSorts = genre || (decade && releaseType) || releaseType ? ['new'] : decade ? ['new', 'year'] : ['new', 'year', 'title'];
  const sort: CatalogSort = allowedSorts.includes(params.get('sort') ?? '') ? params.get('sort') as CatalogSort : 'new';
  const view = params.get('view') === 'grid' ? 'grid' : 'table';
  const showLetters = sort === 'title' && !decade && !genre && !releaseType;
  const requestedLetter = params.get('l');
  const letter = showLetters && requestedLetter && CATALOG_LETTERS.includes(requestedLetter) ? requestedLetter : null;
  const page = await getTapePage(sql, { sort, decade, genreId: genre?.id, releaseType, letter, cursor: params.get('cursor') });
  return { genres, decade, genre, releaseType, allowedSorts: allowedSorts as CatalogSort[], sort, view, showLetters, letter, page };
}
