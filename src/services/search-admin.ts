import type { SqlClient } from '../db/sql-client';
import type { SearchKind } from '../domain/enums';
import { normalizeSearchField, searchDocument } from '../domain/search';
import { runBatch } from '../repositories/batch.repo';
import {
  countSearchQueue, dequeueSearchRefs, enqueueArtistDependentStmts, enqueueLabelDependents, enqueueSearchRefsStmt, listArtistSearchSources,
  listCollectionSearchSources, listLabelSearchSources, listQueuedSearchRefs, listSearchRefsAfter, listSongSearchSources, listTapeSearchSources,
  writeSearchDocumentStmts, type SearchDocumentRow, type SearchRef,
} from '../repositories/search.repo';
import { clearReindexCursor, getReindexState, recordReindexProgress, setReindexCursor, setReindexCursorStmt } from '../repositories/stats.repo';

function doc(kind: SearchKind, refId: string, name: string, parts: (string | null | undefined)[], isPublic: boolean): SearchDocumentRow {
  return { kind, refId, nameKey: normalizeSearchField(name), text: searchDocument(parts), isPublic: Number(isPublic) };
}

async function loadDocuments(db: SqlClient, refs: SearchRef[]): Promise<SearchDocumentRow[]> {
  const groups = new Map<SearchKind, string[]>();
  for (const ref of refs) groups.set(ref.kind, [...(groups.get(ref.kind) || []), ref.refId]);
  const result: SearchDocumentRow[] = [];
  for (const [kind, ids] of groups) {
    if (kind === 'tape') {
      const rows = await listTapeSearchSources(db, ids);
      result.push(...rows.map(row => doc(kind, row.id, row.title, [row.title, row.titleAlt, row.artistNames, row.labelName, row.catalogNo], row.status === 'published')));
    } else if (kind === 'song') {
      const rows = await listSongSearchSources(db, ids);
      result.push(...rows.map(row => doc(kind, row.id, row.title, [row.title, row.titleAlt, row.singers, row.lyricist, row.composer], row.isPublic === 1 || row.publishedTapeCount > 0)));
    } else if (kind === 'artist') {
      const rows = await listArtistSearchSources(db, ids);
      result.push(...rows.map(row => doc(kind, row.id, row.name, [row.name, row.nameAlt, row.members], row.publishedTapeCount > 0 || row.hasPublicSong === 1)));
    } else if (kind === 'label') {
      const rows = await listLabelSearchSources(db, ids);
      result.push(...rows.map(row => doc(kind, row.id, row.name, [row.name, row.nameAlt], row.publishedTapeCount > 0)));
    } else {
      const rows = await listCollectionSearchSources(db, ids);
      result.push(...rows.map(row => doc(kind, row.id, row.title, [row.title], row.status === 'published')));
    }
  }
  return result;
}

async function writeDocuments(db: SqlClient, docs: SearchDocumentRow[]) {
  if (!docs.length) return 0;
  const results = await runBatch(db, writeSearchDocumentStmts(db, docs));
  return results.reduce((sum, result) => sum + (result.meta.rows_written || 0), 0);
}

export async function continueReindex(db: SqlClient, limit = 200) {
  const today = new Date().toISOString().slice(0, 10);
  const stats = await getReindexState(db);
  const writtenToday = stats?.reindexDay === today ? stats.reindexRowsWritten : 0;
  let rebuilding = stats?.reindexCursor !== null && stats?.reindexCursor !== undefined;
  if (writtenToday >= 39_400) return { processed: 0, remaining: -1, limited: true, rebuilding };
  if (stats?.reindexCursor !== null && stats?.reindexCursor !== undefined) {
    const [cursorKind, cursorId] = JSON.parse(stats.reindexCursor) as [string, string];
    const next = await listSearchRefsAfter(db, cursorKind, cursorId);
    if (next.length) {
      const last = next.at(-1)!;
      await runBatch(db, [
        enqueueSearchRefsStmt(db, next),
        setReindexCursorStmt(db, next.length < 200 ? null : JSON.stringify([last.kind, last.refId])),
      ]);
      rebuilding = next.length === 200;
    } else { await clearReindexCursor(db); rebuilding = false; }
  }
  const refs = await listQueuedSearchRefs(db, Math.max(1, Math.min(limit, 200)));
  if (!refs.length) return { processed: 0, remaining: 0, limited: false, rebuilding };
  const docs = await loadDocuments(db, refs);
  const written = await writeDocuments(db, docs);
  await dequeueSearchRefs(db, refs);
  await recordReindexProgress(db, today, writtenToday + written, Date.now());
  const remaining = await countSearchQueue(db);
  return { processed: refs.length, remaining, limited: false, rebuilding };
}

export async function reindexArtistDependents(db: SqlClient, artistId: string) {
  await runBatch(db, enqueueArtistDependentStmts(db, artistId));
  return continueReindex(db);
}

export async function reindexLabelDependents(db: SqlClient, labelId: string) {
  await enqueueLabelDependents(db, labelId);
  return continueReindex(db);
}

export async function enqueueFullReindex(db: SqlClient) {
  await setReindexCursor(db, JSON.stringify(['', '']));
  return continueReindex(db);
}
