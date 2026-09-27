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
  const result = await db.batch([
    write,
    db.prepare(`UPDATE ${targetTable} SET ${countColumn} = (SELECT COUNT(*) FROM ${table} WHERE ${idColumn} = ?) WHERE id = ?`).bind(targetId, targetId),
    db.prepare(`SELECT ${countColumn} AS count FROM ${targetTable} WHERE id = ?`).bind(targetId),
  ]);
  const count = (result[2].results[0] as { count: number } | undefined)?.count;
  return { value, count: count ?? 0 };
}
