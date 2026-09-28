import type { SqlClient } from '../db/sql-client';
import type { SessionUser } from '../domain/types';
import { getLabelBySlug, getLabelPublishedYearRange, type LabelDetail, type LabelYearRange } from '../repositories/labels.repo';
import { getTapePage, type TapeListItem } from '../repositories/tapes.repo';

export type { LabelDetail, LabelYearRange };

export interface LabelDetailModel {
  label: LabelDetail;
  /** First and last year among the label's published tapes. */
  range: LabelYearRange | null;
  /** From `?sort=`: `year` (oldest first), else `new`. */
  sort: 'new' | 'year';
  /** One page of up to 50 published tapes from `?cursor=`. */
  page: { items: TapeListItem[]; nextCursor: string | null };
}

/** A label page; admins also see labels with no published tapes. null when not found. */
export async function loadLabelDetail(sql: SqlClient, slug: string, params: URLSearchParams, viewer?: Pick<SessionUser, 'role'> | null): Promise<LabelDetailModel | null> {
  const admin = viewer?.role === 'admin';
  const label = await getLabelBySlug(sql, slug, admin);
  if (!label) return null;
  const range = await getLabelPublishedYearRange(sql, label.id);
  const sort = params.get('sort') === 'year' ? 'year' : 'new';
  const page = await getTapePage(sql, { labelId: label.id, sort, cursor: params.get('cursor'), pageSize: 50 });
  return { label, range, sort, page };
}
