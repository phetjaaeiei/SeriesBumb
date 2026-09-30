import type { SqlClient } from '../db/sql-client';
import { randomPublicArtist } from '../repositories/artists.repo';

/** A random visible artist's slug for /artists/random, or null when no artist is visible. */
export async function loadRandomArtist(sql: SqlClient, random = Math.random): Promise<{ slug: string } | null> {
  const slug = await randomPublicArtist(sql, random);
  return slug ? { slug } : null;
}
