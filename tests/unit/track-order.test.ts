import { describe, expect, it } from 'vitest';
import { changeTrackSide, moveTrack, numberTracks, reorderSide, type OrderedTrack } from '../../src/lib/client/track-order';

const rows: OrderedTrack[] = [
  { clientId: 'a1', side: 'A' },
  { clientId: 'a2', side: 'A' },
  { clientId: 'b1', side: 'B' },
  { clientId: 'b2', side: 'B' },
];

describe('tape track ordering', () => {
  it('moves a track within its side but never across the side boundary', () => {
    expect(moveTrack(rows, 'a2', -1).map(row => row.clientId)).toEqual(['a2', 'a1', 'b1', 'b2']);
    expect(moveTrack(rows, 'a2', 1)).toBe(rows);
  });

  it('applies drag order to one side and rejects incomplete orders', () => {
    expect(reorderSide(rows, 'B', ['b2', 'b1']).map(row => row.clientId)).toEqual(['a1', 'a2', 'b2', 'b1']);
    expect(reorderSide(rows, 'B', ['b2', 'b2'])).toBe(rows);
  });

  it('places a track at the end of another side and numbers each side independently', () => {
    const moved = changeTrackSide(rows, 'a1', 'B');
    expect(moved.map(row => row.clientId)).toEqual(['a2', 'b1', 'b2', 'a1']);
    expect(numberTracks(moved).map(row => [row.side, row.position])).toEqual([['A', 1], ['B', 1], ['B', 2], ['B', 3]]);
  });
});
