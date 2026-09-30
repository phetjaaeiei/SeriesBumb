import type { SqlClient } from '../db/sql-client';

/** The stored redirect for an old path (written when a slug changes), or null. */
export async function getRedirectTarget(sql: SqlClient, fromPath: string): Promise<{ toPath: string } | null> {
  return sql.prepare('SELECT toPath FROM redirect WHERE fromPath = ?').bind(fromPath).first<{ toPath: string }>();
}

/** Points `oldPath` (and every redirect that led to it) at `newPath`, dropping any redirect away from `newPath`. */
export function moveRedirectStmts(sql: SqlClient, oldPath: string, newPath: string, now: number): D1PreparedStatement[] {
  return [
    sql.prepare('DELETE FROM redirect WHERE fromPath = ?').bind(newPath),
    sql.prepare('UPDATE redirect SET toPath = ? WHERE toPath = ?').bind(newPath, oldPath),
    sql.prepare('INSERT OR REPLACE INTO redirect (fromPath, toPath, createdAt) VALUES (?, ?, ?)').bind(oldPath, newPath, now),
  ];
}

/** Removes every redirect from or to `path`. */
export function deleteRedirectsForPathStmt(sql: SqlClient, path: string): D1PreparedStatement {
  return sql.prepare('DELETE FROM redirect WHERE fromPath = ? OR toPath = ?').bind(path, path);
}
