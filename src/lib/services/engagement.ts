export type EngagementKind = 'tapeLike' | 'songLike' | 'tapeOwned';

const config = {
  tapeLike: { table: 'tape_like', targetTable: 'tape', idColumn: 'tapeId', countColumn: 'likeCount', visibility: "status = 'published'" },
  songLike: { table: 'song_like', targetTable: 'song', idColumn: 'songId', countColumn: 'likeCount', visibility: '(isPublic = 1 OR publishedTapeCount > 0)' },
  tapeOwned: { table: 'tape_owner', targetTable: 'tape', idColumn: 'tapeId', countColumn: 'ownerCount', visibility: "status = 'published'" },
} as const;

export async function setEngagement(db: D1Database, userId: string, kind: EngagementKind, targetId: string, value: boolean) {
  const { table, targetTable, idColumn, countColumn, visibility } = config[kind];
  const target = await db.prepare(`SELECT id FROM ${targetTable} WHERE id = ? AND ${visibility}`).bind(targetId).first<{ id: string }>();
  if (!target) throw new Error('ไม่พบรายการนี้');
  const write = value
    ? db.prepare(`INSERT OR IGNORE INTO ${table} (userId, ${idColumn}, createdAt) VALUES (?, ?, ?)`).bind(userId, targetId, Date.now())
    : db.prepare(`DELETE FROM ${table} WHERE userId = ? AND ${idColumn} = ?`).bind(userId, targetId);
  // One atomic batch; the counter UPDATE matches no row unless the like/owner row really changed,
  // so repeated clicks cost no counter writes.
  const result = await db.batch([
    write,
    db.prepare(`UPDATE ${targetTable} SET ${countColumn} = MAX(0, ${countColumn} ${value ? '+' : '-'} 1) WHERE id = ? AND changes() > 0`).bind(targetId),
    db.prepare(`SELECT ${countColumn} AS count FROM ${targetTable} WHERE id = ?`).bind(targetId),
  ]);
  const changed = (result[0].meta.changes ?? 0) > 0;
  const count = (result[2].results[0] as { count: number } | undefined)?.count;
  return { value, count: count ?? 0, changed };
}
