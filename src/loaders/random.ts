import type { SqlClient } from '../db/sql-client';
import { getFirstPublishedTapeSlug, getMaxTapeRowid, getPublishedTapeSlugFromRowid } from '../repositories/tapes.repo';

/**
 * A random published tape's slug for /random: the first published tape at or after a random rowid,
 * else the first published tape. null when there is no tape at all or none is published.
 */
export async function loadRandomTape(sql: SqlClient, random = Math.random): Promise<{ slug: string } | null> {
  const max = await getMaxTapeRowid(sql);
  if (!max?.value) return null;
  const rowid = Math.floor(random() * max.value) + 1;
  const first = await getPublishedTapeSlugFromRowid(sql, rowid);
  const fallback = first ?? await getFirstPublishedTapeSlug(sql);
  return fallback?.slug ? { slug: fallback.slug } : null;
}
