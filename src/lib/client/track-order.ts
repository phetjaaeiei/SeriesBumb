export const TRACK_SIDES = ['A', 'B', 'C', 'D'] as const;

export type TrackSide = (typeof TRACK_SIDES)[number];
export type OrderedTrack = { clientId: string; side: TrackSide };

export function moveTrack<T extends OrderedTrack>(rows: T[], clientId: string, direction: -1 | 1): T[] {
  const current = rows.find(row => row.clientId === clientId);
  if (!current) return rows;
  const sideRows = rows.filter(row => row.side === current.side);
  const index = sideRows.findIndex(row => row.clientId === clientId);
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= sideRows.length) return rows;
  const ids = sideRows.map(row => row.clientId);
  [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]];
  return reorderSide(rows, current.side, ids);
}

export function reorderSide<T extends OrderedTrack>(rows: T[], side: TrackSide, orderedIds: string[]): T[] {
  const current = rows.filter(row => row.side === side);
  if (current.length !== orderedIds.length || new Set(orderedIds).size !== current.length) return rows;
  const byId = new Map(current.map(row => [row.clientId, row]));
  const ordered = orderedIds.map(id => byId.get(id));
  if (ordered.some(row => !row)) return rows;
  let position = 0;
  return rows.map(row => row.side === side ? ordered[position++]! : row);
}

export function changeTrackSide<T extends OrderedTrack>(rows: T[], clientId: string, side: TrackSide): T[] {
  const current = rows.find(row => row.clientId === clientId);
  if (!current || current.side === side) return rows;
  const remaining = rows.filter(row => row.clientId !== clientId);
  const moved = { ...current, side } as T;
  return TRACK_SIDES.flatMap(group => [
    ...remaining.filter(row => row.side === group),
    ...(group === side ? [moved] : []),
  ]);
}

export function appendTrack<T extends OrderedTrack>(rows: T[], track: T): T[] {
  return TRACK_SIDES.flatMap(side => [
    ...rows.filter(row => row.side === side),
    ...(side === track.side ? [track] : []),
  ]);
}

export function numberTracks<T extends OrderedTrack>(rows: T[]): Array<T & { position: number }> {
  const positions: Record<TrackSide, number> = { A: 0, B: 0, C: 0, D: 0 };
  return rows.map(row => ({ ...row, position: ++positions[row.side] }));
}
