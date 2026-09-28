import { buildSearchQuery } from '../domain/search';
import { decodeCursor, encodeCursor, type CatalogSort } from '../domain/cursor';

export type AdminCatalogKind = 'tapes' | 'songs' | 'artists' | 'labels' | 'genres' | 'collections';

export interface AdminCatalogRow {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published' | null;
  sortKey: number | string;
}

export interface AdminCatalogOptions {
  kind: AdminCatalogKind;
  query?: string;
  status?: 'all' | 'draft' | 'published';
  unlinked?: boolean;
  cursor?: string | null;
  pageSize?: number;
}

const catalog = {
  tapes: { table: 'tape', name: 'title', key: 'updatedAt', sort: 'new', searchKind: 'tape' },
  songs: { table: 'song', name: 'title', key: 'updatedAt', sort: 'new', searchKind: 'song' },
  artists: { table: 'artist', name: 'name', key: 'nameSort', sort: 'title', searchKind: 'artist' },
  labels: { table: 'label', name: 'name', key: 'nameSort', sort: 'title', searchKind: 'label' },
  genres: { table: 'genre', name: 'name', key: 'position', sort: 'year', searchKind: null },
  collections: { table: 'collection', name: 'title', key: 'position', sort: 'year', searchKind: 'collection' },
} as const satisfies Record<AdminCatalogKind, { table: string; name: string; key: string; sort: CatalogSort; searchKind: string | null }>;

export async function getAdminCatalogPage(db: D1Database, options: AdminCatalogOptions): Promise<{ items: AdminCatalogRow[]; nextCursor: string | null }> {
  const config = catalog[options.kind];
  const size = Math.min(Math.max(Math.floor(options.pageSize ?? 50), 1), 50);
  const search = buildSearchQuery(options.query ?? '');
  const where: string[] = [];
  const bindings: (string | number)[] = [];

  if ((options.kind === 'tapes' || options.kind === 'collections' || options.kind === 'songs') && options.status && options.status !== 'all') {
    where.push(options.kind === 'songs' ? '(e.isPublic = 1 OR e.publishedTapeCount > 0) = ?' : 'e.status = ?');
    bindings.push(options.kind === 'songs' ? Number(options.status === 'published') : options.status);
  }
  if (options.unlinked && options.kind === 'songs') {
    where.push('NOT EXISTS (SELECT 1 FROM tape_track tt WHERE tt.songId = e.id)');
  }
  if (options.unlinked && options.kind === 'artists') {
    where.push('NOT EXISTS (SELECT 1 FROM tape_artist ta WHERE ta.artistId = e.id)');
    where.push('NOT EXISTS (SELECT 1 FROM song_artist sa JOIN tape_track tt ON tt.songId = sa.songId WHERE sa.artistId = e.id)');
  }

  if (search.text) {
    if (!config.searchKind) {
      // Genres have no search_doc entry and are a small, manually ordered list.
      where.push('instr(lower(e.name), lower(?)) > 0');
      bindings.push(search.text);
    } else if (search.fts) {
      where.push(`e.id IN (
        SELECT d.refId FROM search_fts f JOIN search_doc d ON d.docId = f.rowid
        WHERE search_fts MATCH ? AND d.kind = ? AND d.isPublic IN (0, 1)
        ORDER BY f.rank LIMIT 300
      )`);
      bindings.push(search.fts, config.searchKind);
    } else {
      where.push(`e.id IN (
        SELECT d.refId FROM search_doc d
        WHERE d.isPublic IN (0, 1) AND d.kind = ? AND d.nameKey >= ? AND d.nameKey < ?
      )`);
      bindings.push(config.searchKind, search.prefix, `${search.prefix}\uffff`);
    }
  }

  const cursor = decodeCursor(config.sort, options.cursor);
  if (cursor) {
    where.push(`(e.${config.key}, e.id) ${config.sort === 'new' ? '<' : '>'} (?, ?)`);
    bindings.push(cursor.key, cursor.id);
  }
  const direction = config.sort === 'new' ? 'DESC' : 'ASC';
  const statusColumn = options.kind === 'songs' ? "CASE WHEN e.isPublic = 1 OR e.publishedTapeCount > 0 THEN 'published' ELSE 'draft' END" : options.kind === 'tapes' || options.kind === 'collections' ? 'e.status' : 'NULL';
  const result = await db.prepare(`
    SELECT e.id, e.slug, e.${config.name} AS title, ${statusColumn} AS status, e.${config.key} AS sortKey
    FROM ${config.table} e
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY e.${config.key} ${direction}, e.id ${direction} LIMIT ?
  `).bind(...bindings, size + 1).all<AdminCatalogRow>();
  const items = result.results.slice(0, size);
  const last = items.at(-1);
  return {
    items,
    nextCursor: result.results.length > size && last ? encodeCursor(config.sort, last.sortKey, last.id) : null,
  };
}
