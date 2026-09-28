import type { SqlClient } from '../db/sql-client';

export async function getLabelIdBySlug(sql: SqlClient, slug: string): Promise<{ id: string } | null> {
  return sql.prepare('SELECT id FROM label WHERE slug = ?').bind(slug).first<{ id: string }>();
}
