import type { SqlClient } from '../../db/sql-client';
import { getTapeImageFullKey } from '../../repositories/images.repo';

export interface AdminTapeImageModel {
  /** Storage key of the full-size original. */
  fullKey: string;
}

/** `/admin/api/image/<imageId>`: where the tape image's original is stored; null when there is no such image. */
export async function loadAdminTapeImage(sql: SqlClient, imageId: string | undefined): Promise<AdminTapeImageModel | null> {
  const row = await getTapeImageFullKey(sql, imageId);
  return row ? { fullKey: row.fullKey } : null;
}
