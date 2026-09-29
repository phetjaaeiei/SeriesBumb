// Reads columns and foreign-key parents from stored CREATE TABLE SQL. D1 blocks the pragma_*
// table-valued functions (SQLITE_AUTH), and one PRAGMA call per table is slow over the API.

export interface ParsedTable { columns: { name: string; type: string }[]; references: string[] }

const identifier = /^\s*(?:`([^`]+)`|"((?:[^"]|"")+)"|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_]*))/u;
const unquote = (match: RegExpExecArray) => (match[1] ?? match[2]?.replaceAll('""', '"') ?? match[3] ?? match[4]);

/** Splits on commas that are not inside parentheses or quotes. */
function topLevelItems(body: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const char of body) {
    if (quote) { if (char === quote) quote = null; current += char; continue; }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) { items.push(current.trim()); current = ''; continue; }
    current += char;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function referencedTable(item: string): string | null {
  const at = item.search(/\bREFERENCES\b/iu);
  if (at < 0) return null;
  const match = identifier.exec(item.slice(at + 'REFERENCES'.length));
  return match ? unquote(match) : null;
}

export function parseCreateTable(sql: string): ParsedTable {
  const open = sql.indexOf('(');
  const close = sql.lastIndexOf(')');
  if (open < 0 || close < open) throw new Error('not a CREATE TABLE statement');
  const columns: ParsedTable['columns'] = [];
  const references: string[] = [];
  for (const item of topLevelItems(sql.slice(open + 1, close))) {
    const parent = referencedTable(item);
    if (parent && !references.includes(parent)) references.push(parent);
    if (/^(?:CONSTRAINT|PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY)\b/iu.test(item)) continue;
    const name = identifier.exec(item);
    if (!name) continue;
    const rest = item.slice(name[0].length).trim();
    const type = /^[A-Za-z][A-Za-z0-9_]*(?:\s*\([^)]*\))?/u.exec(rest)?.[0] ?? '';
    columns.push({ name: unquote(name), type });
  }
  return { columns, references };
}
