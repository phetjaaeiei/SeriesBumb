import type { SqlClient } from '../../db/sql-client';
import { getTapeReadiness, type TapeReadiness } from '../../repositories/tape-readiness.repo';

export type { TapeReadiness };

export interface AdminReadinessModel {
  tapes: TapeReadiness[];
}

/** `/admin/readiness`: the 100 longest-waiting draft tapes with what each one still lacks. */
export async function loadAdminReadiness(sql: SqlClient): Promise<AdminReadinessModel> {
  return { tapes: await getTapeReadiness(sql) };
}
