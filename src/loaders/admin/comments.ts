import type { SqlClient } from '../../db/sql-client';
import { decodeCursor, encodeCursor } from '../../domain/cursor';
import { listAdminComments } from '../../repositories/community.repo';

export type AdminCommentKind = 'all' | 'tape' | 'song';

export interface AdminCommentModelRow {
  id: string;
  body: string;
  createdAt: number;
  deletedAt: number | null;
  /** Only comments an admin removed can be restored; authors' own deletions stay deleted. */
  canRestore: boolean;
  authorName: string;
  authorEmail: string;
  targetTitle: string | null;
  targetUrl: string | null;
}

export interface AdminCommentsModel {
  kind: AdminCommentKind;
  rows: AdminCommentModelRow[];
  next: string | null;
}

/** `/admin/comments`: 50 comments per page in any state, newest first, optionally only on tapes or songs. */
export async function loadAdminComments(sql: SqlClient, params: URLSearchParams): Promise<AdminCommentsModel> {
  const kind: AdminCommentKind = params.get('kind') === 'tape' ? 'tape' : params.get('kind') === 'song' ? 'song' : 'all';
  const cursor = decodeCursor('new', params.get('cursor'));
  const all = await listAdminComments(sql, kind, cursor);
  const rows: AdminCommentModelRow[] = all.slice(0, 50).map(row => ({
    id: row.id, body: row.body, createdAt: row.createdAt, deletedAt: row.deletedAt,
    authorName: row.authorName, authorEmail: row.authorEmail, canRestore: Boolean(row.deletedByAdmin),
    targetTitle: row.tapeTitle || row.songTitle, targetUrl: row.tapeSlug ? `/tapes/${encodeURIComponent(row.tapeSlug)}` : row.songSlug ? `/songs/${encodeURIComponent(row.songSlug)}` : null,
  }));
  const last = rows.at(-1);
  const next = all.length > 50 && last ? encodeCursor('new', last.createdAt, last.id) : null;
  return { kind, rows, next };
}
