import { normalizeThai } from './thai';

/** Normalize one catalog field, retaining no separators inside the field. */
export function normalizeSearchField(value: string): string {
  return normalizeThai(value)
    .replace(/[\u0e47-\u0e4e]/gu, '')
    .replace(/[\p{White_Space}\p{P}\p{S}]+/gu, '');
}

export function searchDocument(parts: (string | null | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part))
    .map(normalizeSearchField).filter(Boolean).join(' | ');
}

export function buildSearchQuery(input: string): { text: string; fts: string | null; prefix: string } {
  const text = [...normalizeThai(input).trim().replace(/\s+/gu, ' ')].slice(0, 100).join('');
  const words = text.split(' ').slice(0, 5).map(normalizeSearchField).filter(Boolean);
  const ftsWords = words.filter(word => [...word].length >= 3);
  return {
    text,
    fts: ftsWords.length ? ftsWords.map(word => `"${word.replace(/"/gu, '""')}"`).join(' ') : null,
    prefix: words.join(''),
  };
}

export interface SearchResult {
  kind: 'tape' | 'song' | 'artist' | 'label' | 'collection';
  slug: string;
  title: string;
}

const searchKinds: SearchResult['kind'][] = ['tape', 'song', 'artist', 'label', 'collection'];

export async function searchPublic(db: D1Database, rawQuery: string): Promise<SearchResult[]> {
  const query = buildSearchQuery(rawQuery);
  if (!query.prefix) return [];
  let indexed: { results: { kind: SearchResult['kind']; refId: string }[] };
  try {
    indexed = query.fts
      ? await db.prepare(`SELECT kind, refId FROM (
          SELECT d.kind, d.refId, row_number() OVER (PARTITION BY d.kind ORDER BY c.rank) AS rn
          FROM (SELECT rowid, rank FROM search_fts WHERE search_fts MATCH ? ORDER BY rank LIMIT 300) c
          JOIN search_doc d ON d.docId = c.rowid WHERE d.isPublic = 1
        ) WHERE rn <= 20`).bind(query.fts).all<{ kind: SearchResult['kind']; refId: string }>()
      : { results: (await Promise.all(searchKinds.map(kind => db.prepare(`SELECT kind, refId FROM search_doc
          WHERE isPublic = 1 AND kind = ? AND nameKey >= ? AND nameKey < ?
          ORDER BY nameKey LIMIT 20`).bind(kind, query.prefix, `${query.prefix}\uffff`)
          .all<{ kind: SearchResult['kind']; refId: string }>())))
          .flatMap(page => page.results) };
  } catch {
    return [];
  }
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
  try {
    for (const { kind, table, title } of tables) {
      const ids = groups.get(kind);
      if (!ids?.length) continue;
      const rows = await db.prepare(`SELECT slug, ${title} AS title FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')}) LIMIT 20`).bind(...ids).all<{ slug: string; title: string }>();
      result.push(...rows.results.map(row => ({ kind, ...row })));
    }
  } catch {
    return [];
  }
  return result;
}
