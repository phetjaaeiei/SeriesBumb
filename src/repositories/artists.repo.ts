import type { SqlClient } from '../db/sql-client';

export async function getArtistIdBySlug(sql: SqlClient, slug: string): Promise<{ id: string } | null> {
  return sql.prepare('SELECT id FROM artist WHERE slug = ?').bind(slug).first<{ id: string }>();
}
