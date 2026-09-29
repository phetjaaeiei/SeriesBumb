import type { SqlClient } from '../db/sql-client';

/** The storage key of a tape image's full-size original, or null. */
export async function getTapeImageFullKey(sql: SqlClient, imageId: string | undefined): Promise<{ fullKey: string } | null> {
  return sql.prepare('SELECT fullKey FROM tape_image WHERE id = ?').bind(imageId).first<{ fullKey: string }>();
}
