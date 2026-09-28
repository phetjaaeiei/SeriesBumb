import type { SqlClient } from '../db/sql-client';
import { getTapePage, type TapeListItem } from '../repositories/tapes.repo';

export interface DecadeModel {
  /** The decade's first year, e.g. 1980 for "1980s". */
  decade: number;
  sort: 'new' | 'year';
  page: { items: TapeListItem[]; nextCursor: string | null };
}

/** One decade's tapes, or null when `value` is not a decade the catalog covers (e.g. "1980s"). */
export async function loadDecade(sql: SqlClient, value: string, params: URLSearchParams): Promise<DecadeModel | null> {
  if (!/^(19[5-9]|20[0-2])0s$/u.test(value)) return null;
  const decade = Number(value.slice(0, 4));
  const sort = params.get('sort') === 'year' ? 'year' : 'new';
  const page = await getTapePage(sql, { decade, sort, cursor: params.get('cursor') });
  return { decade, sort, page };
}
