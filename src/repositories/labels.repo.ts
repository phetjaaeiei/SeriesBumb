import type { SqlClient } from '../db/sql-client';
import type { CursorKey } from '../domain/cursor';

export async function getLabelIdBySlug(sql: SqlClient, slug: string): Promise<{ id: string } | null> {
  return sql.prepare('SELECT id FROM label WHERE slug = ?').bind(slug).first<{ id: string }>();
}

export interface LabelListRow { id: string; slug: string; name: string; nameSort: string; publishedTapeCount: number }

/** Up to 101 labels with published tapes by name after `cursor` (one more than a page, so callers can tell if more follow). */
export async function listVisibleLabelsByName(sql: SqlClient, cursor: { key: CursorKey; id: string } | null): Promise<LabelListRow[]> {
  return (await sql.prepare(`SELECT id, slug, name, nameSort, publishedTapeCount FROM label WHERE publishedTapeCount > 0 ${cursor ? 'AND (nameSort, id) > (?, ?)' : ''} ORDER BY nameSort, id LIMIT 101`).bind(...(cursor ? [cursor.key, cursor.id] : [])).all<LabelListRow>()).results;
}

export interface LabelDetail { id: string; name: string; nameAlt: string | null; description: string; logoKey: string | null; publishedTapeCount: number; createdAt: number; updatedAt: number; createdByName: string | null; updatedByName: string | null }

/** A label by slug with its creator/editor names; unless `admin`, only labels with published tapes. */
export async function getLabelBySlug(sql: SqlClient, slug: string, admin: boolean): Promise<LabelDetail | null> {
  return sql.prepare(`SELECT l.*, creator.name AS createdByName, editor.name AS updatedByName FROM label l LEFT JOIN user creator ON creator.id = l.createdBy LEFT JOIN user editor ON editor.id = l.updatedBy WHERE l.slug = ? ${admin ? '' : 'AND l.publishedTapeCount > 0'}`).bind(slug).first<LabelDetail>();
}

export interface LabelYearRange { firstYear: number | null; lastYear: number | null }

/** The first and last year among the label's published tapes that have a year. */
export async function getLabelPublishedYearRange(sql: SqlClient, labelId: string): Promise<LabelYearRange | null> {
  return sql.prepare("SELECT MIN(year) AS firstYear, MAX(year) AS lastYear FROM tape WHERE labelId = ? AND status = 'published' AND year IS NOT NULL").bind(labelId).first<LabelYearRange>();
}

/** The first 100 labels with published tapes by name, for the advanced search filter. */
export async function listLabelFilterOptions(sql: SqlClient): Promise<{ slug: string; name: string }[]> {
  return (await sql.prepare('SELECT slug, name FROM label WHERE publishedTapeCount > 0 ORDER BY nameSort LIMIT 100').all<{ slug: string; name: string }>()).results;
}
