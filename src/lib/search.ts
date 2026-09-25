import { normalizeThai } from './thai';

export function buildSearchQuery(input: string): { text: string; fts: string | null; prefix: string } {
  const text = normalizeThai(input).trim().replace(/\s+/gu, ' ').slice(0, 100);
  const codepoints = [...text];
  return {
    text,
    fts: codepoints.length >= 3 ? `"${text.replace(/"/gu, '""')}"` : null,
    prefix: text,
  };
}

export interface SearchResult {
  kind: 'tape' | 'song' | 'artist' | 'label' | 'collection';
  slug: string;
  title: string;
}

export async function searchPublic(db: D1Database, rawQuery: string): Promise<SearchResult[]> {
  const query = buildSearchQuery(rawQuery);
  if (!query.text) return [];
  const indexed = query.fts
    ? await db.prepare(`SELECT d.kind, d.refId FROM search_fts f JOIN search_doc d ON d.docId = f.rowid WHERE search_fts MATCH ? AND d.isPublic = 1 LIMIT 75`).bind(query.fts).all<{ kind: SearchResult['kind']; refId: string }>()
    : await db.prepare(`SELECT kind, refId FROM search_doc WHERE isPublic = 1 AND nameKey >= ? AND nameKey < ? LIMIT 75`).bind(query.prefix, `${query.prefix}\uffff`).all<{ kind: SearchResult['kind']; refId: string }>();
  const groups = new Map<SearchResult['kind'], string[]>();
  for (const row of indexed.results) {
    const ids = groups.get(row.kind) ?? [];
    ids.push(row.refId);
    groups.set(row.kind, ids);
  }
  const result: SearchResult[] = [];
  const tables: { kind: SearchResult['kind']; table: string; title: string }[] = [
    { kind: 'tape', table: 'tape', title: 'title' },
    { kind: 'song', table: 'song', title: 'title' },
    { kind: 'artist', table: 'artist', title: 'name' },
    { kind: 'label', table: 'label', title: 'name' },
    { kind: 'collection', table: 'collection', title: 'title' },
  ];
  for (const { kind, table, title } of tables) {
    const ids = groups.get(kind);
    if (!ids?.length) continue;
    const rows = await db.prepare(`SELECT slug, ${title} AS title FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')}) LIMIT 15`).bind(...ids).all<{ slug: string; title: string }>();
    result.push(...rows.results.map(row => ({ kind, ...row })));
  }
  return result;
}
