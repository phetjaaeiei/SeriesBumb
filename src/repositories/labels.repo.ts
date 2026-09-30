import { jsonParam } from '../db/client';
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

// Writes for the admin label editor and the catalog services that keep label counters in step.

export interface LabelInsert { id: string; slug: string; name: string; nameSort: string; userId: string; now: number }

/** A new label with an empty description. */
export function insertLabelStmt(sql: SqlClient, label: LabelInsert): D1PreparedStatement {
  return sql.prepare("INSERT INTO label (id, slug, name, nameSort, description, createdBy, createdAt, updatedBy, updatedAt) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?)").bind(label.id, label.slug, label.name, label.nameSort, label.userId, label.now, label.userId, label.now);
}

export async function getLabelName(sql: SqlClient, id: string): Promise<{ name: string } | null> {
  return sql.prepare('SELECT name FROM label WHERE id = ?').bind(id).first<{ name: string }>();
}

/** Recounts, for each of these labels, its published tapes. */
export function refreshLabelPublishedTapeCountsStmt(sql: SqlClient, labelIds: string[]): D1PreparedStatement {
  return sql.prepare(`UPDATE label SET publishedTapeCount = (SELECT COUNT(*) FROM tape WHERE labelId = label.id AND status = 'published') WHERE id IN (SELECT value FROM json_each(?))`).bind(jsonParam(labelIds));
}

/** Recounts one label's published tapes. */
export function refreshOneLabelPublishedTapeCountStmt(sql: SqlClient, labelId: string): D1PreparedStatement {
  return sql.prepare("UPDATE label SET publishedTapeCount = (SELECT COUNT(*) FROM tape WHERE labelId = ? AND status = 'published') WHERE id = ?").bind(labelId, labelId);
}

export interface LabelSaveRow { slug: string; name: string; publishedTapeCount: number }

/** The stored fields saveLabel keeps or compares against, or null. */
export async function getLabelForSave(sql: SqlClient, id: string): Promise<LabelSaveRow | null> {
  return sql.prepare('SELECT slug, name, publishedTapeCount FROM label WHERE id = ?').bind(id).first<LabelSaveRow>();
}

export interface LabelUpdate { id: string; slug: string; name: string; nameAlt: string | null; nameSort: string; description: string; logoKey: string | null; userId: string; now: number }

/** Overwrites every editable column of the label. */
export function updateLabelStmt(sql: SqlClient, label: LabelUpdate): D1PreparedStatement {
  return sql.prepare('UPDATE label SET slug = ?, name = ?, nameAlt = ?, nameSort = ?, description = ?, logoKey = ?, updatedBy = ?, updatedAt = ? WHERE id = ?').bind(label.slug, label.name, label.nameAlt, label.nameSort, label.description, label.logoKey, label.userId, label.now, label.id);
}

/** The label's slug and logo (key and bytes, the key as `imageKey`), for deleting it, or null. */
export async function getLabelForDelete(sql: SqlClient, id: string): Promise<{ slug: string; imageKey: string | null; imageBytes: number } | null> {
  return sql.prepare('SELECT slug, logoKey AS imageKey, imageBytes FROM label WHERE id = ?').bind(id).first<{ slug: string; imageKey: string | null; imageBytes: number }>();
}

/** How many tapes (drafts included) are on the label, as a `{ count }` row. */
export async function countLabelTapes(sql: SqlClient, id: string): Promise<{ count: number } | null> {
  return sql.prepare('SELECT COUNT(*) AS count FROM tape WHERE labelId = ?').bind(id).first<{ count: number }>();
}

export function deleteLabelStmt(sql: SqlClient, id: string): D1PreparedStatement {
  return sql.prepare('DELETE FROM label WHERE id = ?').bind(id);
}
