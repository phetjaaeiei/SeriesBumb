import type { SqlClient } from '../db/sql-client';

/** Removes one session row, signing that browser out. */
export async function deleteSession(sql: SqlClient, sessionId: string): Promise<void> {
  await sql.prepare('DELETE FROM session WHERE id = ?').bind(sessionId).run();
}
