export async function randomPublicArtist(db: D1Database, random = Math.random): Promise<string | null> {
  const visible = `EXISTS (SELECT 1 FROM song_artist sa JOIN song s ON s.id = sa.songId WHERE sa.artistId = a.id AND s.isPublic = 1) OR a.publishedTapeCount > 0`;
  const count = await db.prepare(`SELECT COUNT(*) AS value FROM artist a WHERE ${visible}`).first<{ value: number }>();
  if (!count?.value) return null;
  const offset = Math.min(count.value - 1, Math.max(0, Math.floor(random() * count.value)));
  const row = await db.prepare(`SELECT a.slug FROM artist a WHERE ${visible} ORDER BY a.nameSort, a.id LIMIT 1 OFFSET ?`).bind(offset).first<{ slug: string }>();
  return row?.slug ?? null;
}
