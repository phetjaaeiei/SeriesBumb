import type { SqlClient } from '../db/sql-client';
import { decodeCursor, encodeCursor } from '../domain/cursor';
import { listVisibleLabelsByName, type LabelListRow } from '../repositories/labels.repo';

export type { LabelListRow };

export interface LabelsModel {
  /** One page of up to 100 labels with published tapes, by name. */
  labels: LabelListRow[];
  next: string | null;
}

/** The /labels listing: 100 labels with published tapes per page by name. */
export async function loadLabels(sql: SqlClient, params: URLSearchParams): Promise<LabelsModel> {
  const cursor = decodeCursor('title', params.get('cursor'));
  const rows = await listVisibleLabelsByName(sql, cursor);
  const labels = rows.slice(0, 100);
  const last = labels.at(-1);
  const next = rows.length > 100 && last ? encodeCursor('title', last.nameSort, last.id) : null;
  return { labels, next };
}
