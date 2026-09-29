import type { SqlClient } from '../db/sql-client';

/** The stored redirect for an old path (written when a slug changes), or null. */
export async function getRedirectTarget(sql: SqlClient, fromPath: string): Promise<{ toPath: string } | null> {
  return sql.prepare('SELECT toPath FROM redirect WHERE fromPath = ?').bind(fromPath).first<{ toPath: string }>();
}
