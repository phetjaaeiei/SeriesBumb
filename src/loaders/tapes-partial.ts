import type { SqlClient } from '../db/sql-client';
import type { CatalogSort } from '../domain/cursor';
import { RELEASE_TYPES, type ReleaseType } from '../domain/enums';
import { CATALOG_LETTERS } from '../domain/thai';
import { getArtistIdBySlug } from '../repositories/artists.repo';
import { getGenreIdBySlug } from '../repositories/genres.repo';
import { getLabelIdBySlug } from '../repositories/labels.repo';
import { getTapePage, type TapeListItem } from '../repositories/tapes.repo';

export interface TapesPartialModel {
  page: { items: TapeListItem[]; nextCursor: string | null };
  view: 'grid' | 'table';
  showLabel: boolean;
}

/** The "load more" fragment: the next page of any tape listing (all, decade, genre, label or artist). */
export async function loadTapesPartial(sql: SqlClient, params: URLSearchParams): Promise<TapesPartialModel> {
  const decadeText = params.get('decade');
  const decade = decadeText && /^(19[5-9]|20[0-2])0s$/u.test(decadeText) ? Number(decadeText.slice(0, 4)) : null;
  const rawType = params.get('type');
  const releaseType: ReleaseType | null = RELEASE_TYPES.find(type => type === rawType) ?? null;
  const labelSlug = params.get('label');
  const artistSlug = params.get('artist');
  const genreSlug = params.get('genre');
  const [label, artist, genre] = await Promise.all([
    labelSlug ? getLabelIdBySlug(sql, labelSlug) : null,
    artistSlug ? getArtistIdBySlug(sql, artistSlug) : null,
    genreSlug ? getGenreIdBySlug(sql, genreSlug) : null,
  ]);

  const allowedSorts: CatalogSort[] = artist ? ['year'] : label ? ['new', 'year'] : genre || releaseType ? ['new'] : decade ? ['new', 'year'] : ['new', 'year', 'title'];
  const sort: CatalogSort = allowedSorts.includes(params.get('sort') as CatalogSort) ? params.get('sort') as CatalogSort : artist ? 'year' : 'new';
  const requestedLetter = params.get('l');
  const letter = sort === 'title' && !decade && !genre && !releaseType && !label && !artist && requestedLetter && CATALOG_LETTERS.includes(requestedLetter) ? requestedLetter : null;
  const page = await getTapePage(sql, {
    decade, genreId: genre?.id, labelId: label?.id, artistId: artist?.id, releaseType,
    sort, letter, cursor: params.get('cursor'), pageSize: label || artist ? 50 : 24,
  });
  const view = params.get('view') === 'grid' ? 'grid' : 'table';
  const showLabel = !label && !artist;
  return { page, view, showLabel };
}
