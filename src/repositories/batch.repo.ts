// The unit of work for writes that span aggregates. Services build a write from the statements the
// other repositories return (their `...Stmt` functions) and commit them here as one D1 batch: the
// statements run in order and commit together or not at all.
import type { SqlClient } from '../db/sql-client';

/** Runs `statements` as one atomic batch and returns their results in the same order. */
export async function runBatch(sql: SqlClient, statements: D1PreparedStatement[]): Promise<D1Result[]> {
  return sql.batch(statements);
}
