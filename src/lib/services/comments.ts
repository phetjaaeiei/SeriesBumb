import { decodeCursor, encodeCursor } from '../queries/cursor';

export interface CommentDto {
  id: string;
  body: string;
  createdAt: number;
  author: { name: string; image: string | null };
  isMine: boolean;
}
export type CommentTarget = { tapeId: string; songId?: never } | { songId: string; tapeId?: never };

export class CommentError extends Error {
  constructor(message: string, public code: 'BAD_REQUEST' | 'NOT_FOUND' | 'FORBIDDEN' = 'BAD_REQUEST') { super(message); }
}

export function normalizeComment(input: string): string {
  return input.normalize('NFC')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu, '')
    .replace(/\r\n?/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function targetConfig(target: CommentTarget) {
  return target.tapeId
    ? { column: 'tapeId' as const, id: target.tapeId, table: 'tape' as const, visible: "status = 'published'" }
    : { column: 'songId' as const, id: target.songId!, table: 'song' as const, visible: '(isPublic = 1 OR publishedTapeCount > 0)' };
}

async function assertVisible(db: D1Database, target: CommentTarget) {
  const config = targetConfig(target);
  const row = await db.prepare(`SELECT id FROM ${config.table} WHERE id = ? AND ${config.visible}`).bind(config.id).first();
  if (!row) throw new CommentError('ไม่พบรายการนี้', 'NOT_FOUND');
  return config;
}

function safeAvatar(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.googleusercontent.com') ? url.href : null;
  } catch { return null; }
}

function dto(row: { id: string; body: string; createdAt: number; userId: string; name: string; image: string | null }, viewerId?: string | null): CommentDto {
  return { id: row.id, body: row.body, createdAt: row.createdAt, author: { name: [...row.name].slice(0, 50).join(''), image: safeAvatar(row.image) }, isMine: row.userId === viewerId };
}

export async function listComments(db: D1Database, target: CommentTarget, cursor?: string | null, viewerId?: string | null) {
  const config = await assertVisible(db, target);
  const decoded = decodeCursor('new', cursor);
  const paging = decoded ? 'AND (c.createdAt, c.id) < (?, ?)' : '';
  const query = `SELECT c.id, c.body, c.createdAt, c.userId, u.name, u.image FROM comment c JOIN user u ON u.id = c.userId
    WHERE c.${config.column} = ? AND c.deletedAt IS NULL ${paging} ORDER BY c.createdAt DESC, c.id DESC LIMIT 21`;
  const rows = (await db.prepare(query).bind(config.id, ...(decoded ? [decoded.key, decoded.id] : [])).all<{ id: string; body: string; createdAt: number; userId: string; name: string; image: string | null }>()).results;
  const more = rows.length > 20;
  const page = rows.slice(0, 20);
  const last = page.at(-1);
  return { items: page.map(row => dto(row, viewerId)), nextCursor: more && last ? encodeCursor('new', last.createdAt, last.id) : null };
}

export async function createComment(db: D1Database, userId: string, role: 'member' | 'admin', target: CommentTarget, rawBody: string) {
  const body = normalizeComment(rawBody);
  if ([...body].length < 1 || [...body].length > 1000) throw new CommentError('คอมเมนต์ต้องมี 1–1,000 ตัวอักษร');
  const config = targetConfig(target);
  const id = crypto.randomUUID();
  const now = Date.now();
  const rateWhere = role === 'admin' ? '' : `AND (SELECT COUNT(*) FROM comment WHERE userId = ? AND createdAt > ?) < 5
    AND (SELECT COUNT(*) FROM comment WHERE userId = ? AND createdAt > ?) < 50`;
  const insert = db.prepare(`INSERT INTO comment (id, userId, tapeId, songId, body, createdAt)
    SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT commentBanned FROM user WHERE id = ?) = 0 ${rateWhere}
      AND EXISTS (SELECT 1 FROM ${config.table} WHERE id = ? AND ${config.visible})`);
  const binds: (string | number | null)[] = [id, userId, target.tapeId || null, target.songId || null, body, now, userId];
  if (role !== 'admin') binds.push(userId, now - 60_000, userId, now - 86_400_000);
  binds.push(config.id);
  const result = await insert.bind(...binds).run();
  if (!result.meta.changes) {
    const current = await db.prepare('SELECT commentBanned FROM user WHERE id = ?').bind(userId).first<{ commentBanned: number }>();
    if (current?.commentBanned) throw new CommentError('บัญชีนี้ถูกระงับการคอมเมนต์', 'FORBIDDEN');
    await assertVisible(db, target);
    throw new CommentError('คอมเมนต์ถี่เกินไป กรุณารอสักครู่');
  }
  await db.prepare(`UPDATE ${config.table} SET commentCount = (SELECT COUNT(*) FROM comment WHERE ${config.column} = ? AND deletedAt IS NULL) WHERE id = ?`).bind(config.id, config.id).run();
  const row = await db.prepare('SELECT c.id, c.body, c.createdAt, c.userId, u.name, u.image FROM comment c JOIN user u ON u.id = c.userId WHERE c.id = ?').bind(id).first<{ id: string; body: string; createdAt: number; userId: string; name: string; image: string | null }>();
  return dto(row!, userId);
}

export async function deleteOwnComment(db: D1Database, userId: string, commentId: string) {
  const row = await db.prepare('SELECT tapeId, songId FROM comment WHERE id = ? AND userId = ? AND deletedAt IS NULL').bind(commentId, userId).first<{ tapeId: string | null; songId: string | null }>();
  if (!row) throw new CommentError('ไม่พบคอมเมนต์นี้', 'NOT_FOUND');
  const result = await db.prepare('UPDATE comment SET deletedAt = ?, deletedBy = ?, deletedByAdmin = 0 WHERE id = ? AND userId = ? AND deletedAt IS NULL').bind(Date.now(), userId, commentId, userId).run();
  if (!result.meta.changes) throw new CommentError('ไม่พบคอมเมนต์นี้', 'NOT_FOUND');
  const config = targetConfig(row.tapeId ? { tapeId: row.tapeId } : { songId: row.songId! });
  await db.prepare(`UPDATE ${config.table} SET commentCount = (SELECT COUNT(*) FROM comment WHERE ${config.column} = ? AND deletedAt IS NULL) WHERE id = ?`).bind(config.id, config.id).run();
  return { id: commentId };
}
