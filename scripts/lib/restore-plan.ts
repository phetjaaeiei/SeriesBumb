// Splits a data-only D1 export into parts that each fit one day of D1 Free writes (100k rows),
// ordered so every foreign key's parent rows are imported first. Tables in a foreign-key cycle
// (e.g. tape <-> tape_image) stay in one part, where PRAGMA defer_foreign_keys covers them.

export interface RestorePart { tables: string[]; lines: string[]; estimatedWrites: number }

/** INSERT statements grouped by table in dump order. Only real line starts count (see insertCounts). */
export function splitDumpByTable(dump: string): Map<string, string[]> {
  const byTable = new Map<string, string[]>();
  for (const line of dump.split('\n')) {
    const match = /^INSERT INTO "?([A-Za-z0-9_]+)"?/u.exec(line);
    if (!match) continue;
    const rows = byTable.get(match[1]) ?? [];
    rows.push(line);
    byTable.set(match[1], rows);
  }
  return byTable;
}

/** Strongly connected components (Tarjan) over child -> parent references. */
function components(tables: string[], references: Map<string, string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const result: string[][] = [];
  let next = 0;
  const visit = (table: string) => {
    index.set(table, next); low.set(table, next); next += 1;
    stack.push(table); onStack.add(table);
    for (const parent of references.get(table) ?? []) {
      if (!tables.includes(parent)) continue;
      if (!index.has(parent)) { visit(parent); low.set(table, Math.min(low.get(table)!, low.get(parent)!)); }
      else if (onStack.has(parent)) low.set(table, Math.min(low.get(table)!, index.get(parent)!));
    }
    if (low.get(table) === index.get(table)) {
      const group: string[] = [];
      let member: string;
      do { member = stack.pop()!; onStack.delete(member); group.push(member); } while (member !== table);
      result.push(group.sort((a, b) => tables.indexOf(a) - tables.indexOf(b)));
    }
  };
  for (const table of tables) if (!index.has(table)) visit(table);
  return result;
}

/**
 * Parents first (Kahn's algorithm, ties broken by dump order), then consecutive groups packed into
 * parts whose estimated writes (rows x (1 + indexes)) stay within the budget.
 */
export function planRestoreParts(byTable: Map<string, string[]>, references: Map<string, string[]>, indexCounts: Map<string, number>, budget: number): RestorePart[] {
  const tables = [...byTable.keys()];
  const groups = components(tables, references);
  const groupOf = new Map(groups.flatMap((group, i) => group.map((table) => [table, i] as const)));
  const parents = groups.map((group, i) => new Set(group.flatMap((table) => (references.get(table) ?? []).filter((p) => groupOf.has(p)).map((p) => groupOf.get(p)!)).filter((g) => g !== i)));
  const firstSeen = (i: number) => Math.min(...groups[i].map((table) => tables.indexOf(table)));
  const done = new Set<number>();
  const ordered: number[] = [];
  while (ordered.length < groups.length) {
    const ready = groups.map((_, i) => i).filter((i) => !done.has(i) && [...parents[i]].every((p) => done.has(p)));
    ready.sort((a, b) => firstSeen(a) - firstSeen(b));
    done.add(ready[0]); ordered.push(ready[0]);
  }
  const writes = (table: string) => byTable.get(table)!.length * (1 + (indexCounts.get(table) ?? 0));
  const parts: RestorePart[] = [];
  for (const i of ordered) {
    const group = groups[i];
    const cost = group.reduce((sum, table) => sum + writes(table), 0);
    if (cost > budget) throw new Error(`${group.join(', ')} alone need about ${cost} row writes, over the ${budget} budget for one run`);
    const last = parts.at(-1);
    if (last && last.estimatedWrites + cost <= budget) {
      last.tables.push(...group);
      last.lines.push(...group.flatMap((table) => byTable.get(table)!));
      last.estimatedWrites += cost;
    } else {
      parts.push({ tables: [...group], lines: group.flatMap((table) => byTable.get(table)!), estimatedWrites: cost });
    }
  }
  return parts;
}
