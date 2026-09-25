import { jsonParam } from '../../db/client';
import { normalizeThai } from '../thai';

type Kind = 'tape' | 'song' | 'artist' | 'label' | 'collection';
interface Ref { kind: Kind; refId: string }
interface Doc extends Ref { nameKey: string; text: string; isPublic: number }

function doc(kind: Kind, refId: string, name: string, parts: (string | null | undefined)[], isPublic: boolean): Doc {
  return { kind, refId, nameKey: normalizeThai(name), text: normalizeThai(parts.filter(Boolean).join(' | ')), isPublic: Number(isPublic) };
}

async function loadDocuments(db: D1Database, refs: Ref[]): Promise<Doc[]> {
  const groups = new Map<Kind, string[]>();
  for (const ref of refs) groups.set(ref.kind, [...(groups.get(ref.kind) || []), ref.refId]);
  const result: Doc[] = [];
  for (const [kind, ids] of groups) {
    const values = jsonParam(ids);
    if (kind === 'tape') {
      const rows = (await db.prepare(`SELECT t.id, t.title, t.titleAlt, t.catalogNo, t.status, l.name AS labelName,
        (SELECT group_concat(a.name, ' | ') FROM tape_artist ta JOIN artist a ON a.id = ta.artistId WHERE ta.tapeId = t.id) AS artistNames
        FROM tape t LEFT JOIN label l ON l.id = t.labelId WHERE t.id IN (SELECT value FROM json_each(?))`).bind(values).all<{ id: string; title: string; titleAlt: string | null; catalogNo: string | null; status: string; labelName: string | null; artistNames: string | null }>()).results;
      result.push(...rows.map(row => doc(kind, row.id, row.title, [row.title, row.titleAlt, row.artistNames, row.labelName, row.catalogNo], row.status === 'published')));
    } else if (kind === 'song') {
      const rows = (await db.prepare(`SELECT s.id, s.title, s.titleAlt, s.lyricist, s.composer, s.publishedTapeCount,
        (SELECT group_concat(a.name, ' | ') FROM song_artist sa JOIN artist a ON a.id = sa.artistId WHERE sa.songId = s.id) AS singers
        FROM song s WHERE s.id IN (SELECT value FROM json_each(?))`).bind(values).all<{ id: string; title: string; titleAlt: string | null; lyricist: string | null; composer: string | null; publishedTapeCount: number; singers: string | null }>()).results;
      result.push(...rows.map(row => doc(kind, row.id, row.title, [row.title, row.titleAlt, row.singers, row.lyricist, row.composer], row.publishedTapeCount > 0)));
    } else if (kind === 'artist') {
      const rows = (await db.prepare(`SELECT a.id, a.name, a.nameAlt, a.publishedTapeCount,
        (SELECT group_concat(m.name, ' | ') FROM artist_member m WHERE m.artistId = a.id) AS members
        FROM artist a WHERE a.id IN (SELECT value FROM json_each(?))`).bind(values).all<{ id: string; name: string; nameAlt: string | null; publishedTapeCount: number; members: string | null }>()).results;
      result.push(...rows.map(row => doc(kind, row.id, row.name, [row.name, row.nameAlt, row.members], row.publishedTapeCount > 0)));
    } else if (kind === 'label') {
      const rows = (await db.prepare('SELECT id, name, nameAlt, publishedTapeCount FROM label WHERE id IN (SELECT value FROM json_each(?))').bind(values).all<{ id: string; name: string; nameAlt: string | null; publishedTapeCount: number }>()).results;
      result.push(...rows.map(row => doc(kind, row.id, row.name, [row.name, row.nameAlt], row.publishedTapeCount > 0)));
    } else {
      const rows = (await db.prepare('SELECT id, title, status FROM collection WHERE id IN (SELECT value FROM json_each(?))').bind(values).all<{ id: string; title: string; status: string }>()).results;
      result.push(...rows.map(row => doc(kind, row.id, row.title, [row.title], row.status === 'published')));
    }
  }
  return result;
}

async function writeDocuments(db: D1Database, docs: Doc[]) {
  if (!docs.length) return 0;
  const payload = jsonParam(docs);
  const results = await db.batch([
    db.prepare(`INSERT INTO search_doc (kind, refId, isPublic, nameKey)
      SELECT json_extract(value,'$.kind'), json_extract(value,'$.refId'), json_extract(value,'$.isPublic'), json_extract(value,'$.nameKey')
      FROM json_each(?) WHERE true ON CONFLICT(kind, refId) DO UPDATE SET isPublic = excluded.isPublic, nameKey = excluded.nameKey`).bind(payload),
    db.prepare(`DELETE FROM search_fts WHERE rowid IN (SELECT d.docId FROM search_doc d JOIN json_each(?) j
      ON d.kind = json_extract(j.value,'$.kind') AND d.refId = json_extract(j.value,'$.refId'))`).bind(payload),
    db.prepare(`INSERT INTO search_fts (rowid, text) SELECT d.docId, json_extract(j.value,'$.text') FROM json_each(?) j JOIN search_doc d
      ON d.kind = json_extract(j.value,'$.kind') AND d.refId = json_extract(j.value,'$.refId')`).bind(payload),
  ]);
  return results.reduce((sum, result) => sum + (result.meta.rows_written || 0), 0);
}

export async function continueReindex(db: D1Database, limit = 200) {
  const today = new Date().toISOString().slice(0, 10);
  const stats = await db.prepare('SELECT reindexCursor, reindexDay, reindexRowsWritten FROM site_stats WHERE id = 1').first<{ reindexCursor: string | null; reindexDay: string | null; reindexRowsWritten: number }>();
  const writtenToday = stats?.reindexDay === today ? stats.reindexRowsWritten : 0;
  let rebuilding = stats?.reindexCursor !== null && stats?.reindexCursor !== undefined;
  if (writtenToday >= 39_400) return { processed: 0, remaining: -1, limited: true, rebuilding };
  if (stats?.reindexCursor !== null && stats?.reindexCursor !== undefined) {
    const [cursorKind, cursorId] = JSON.parse(stats.reindexCursor) as [string, string];
    const next = (await db.prepare(`SELECT kind, refId FROM (
      SELECT 'artist' AS kind, id AS refId FROM artist UNION ALL SELECT 'collection', id FROM collection
      UNION ALL SELECT 'label', id FROM label UNION ALL SELECT 'song', id FROM song UNION ALL SELECT 'tape', id FROM tape
    ) WHERE (kind, refId) > (?, ?) ORDER BY kind, refId LIMIT 200`).bind(cursorKind, cursorId).all<Ref>()).results;
    if (next.length) {
      const last = next.at(-1)!;
      await db.batch([
        db.prepare(`INSERT OR IGNORE INTO search_queue (kind, refId) SELECT json_extract(value,'$.kind'), json_extract(value,'$.refId') FROM json_each(?)`).bind(jsonParam(next)),
        db.prepare('UPDATE site_stats SET reindexCursor = ? WHERE id = 1').bind(next.length < 200 ? null : JSON.stringify([last.kind, last.refId])),
      ]);
      rebuilding = next.length === 200;
    } else { await db.prepare('UPDATE site_stats SET reindexCursor = NULL WHERE id = 1').run(); rebuilding = false; }
  }
  const refs = (await db.prepare('SELECT kind, refId FROM search_queue ORDER BY kind, refId LIMIT ?').bind(Math.max(1, Math.min(limit, 200))).all<Ref>()).results;
  if (!refs.length) return { processed: 0, remaining: 0, limited: false, rebuilding };
  const docs = await loadDocuments(db, refs);
  const written = await writeDocuments(db, docs);
  await db.prepare(`DELETE FROM search_queue WHERE (kind, refId) IN
    (SELECT json_extract(value,'$.kind'), json_extract(value,'$.refId') FROM json_each(?))`).bind(jsonParam(refs)).run();
  await db.prepare('UPDATE site_stats SET reindexDay = ?, reindexRowsWritten = ?, updatedAt = ? WHERE id = 1').bind(today, writtenToday + written, Date.now()).run();
  const remaining = await db.prepare('SELECT COUNT(*) AS count FROM search_queue').first<{ count: number }>();
  return { processed: refs.length, remaining: remaining?.count ?? 0, limited: false, rebuilding };
}

export async function reindexArtistDependents(db: D1Database, artistId: string) {
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO search_queue (kind, refId) SELECT 'tape', tapeId FROM tape_artist WHERE artistId = ?").bind(artistId),
    db.prepare("INSERT OR IGNORE INTO search_queue (kind, refId) SELECT 'song', songId FROM song_artist WHERE artistId = ?").bind(artistId),
  ]);
  return continueReindex(db);
}

export async function reindexLabelDependents(db: D1Database, labelId: string) {
  await db.prepare("INSERT OR IGNORE INTO search_queue (kind, refId) SELECT 'tape', id FROM tape WHERE labelId = ?").bind(labelId).run();
  return continueReindex(db);
}

export async function enqueueFullReindex(db: D1Database) {
  await db.prepare('UPDATE site_stats SET reindexCursor = ? WHERE id = 1').bind(JSON.stringify(['', ''])).run();
  return continueReindex(db);
}
