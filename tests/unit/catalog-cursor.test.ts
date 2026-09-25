import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../../src/lib/queries/cursor';

describe('catalog cursors', () => {
  it('round trips a Unicode title sort key with a stable tie-break id', () => {
    const cursor = encodeCursor('title', '1กแสง\u0001แสง', 'tape-1');
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(decodeCursor('title', cursor)).toEqual({ key: '1กแสง\u0001แสง', id: 'tape-1' });
  });

  it('rejects malformed values and cursors from the wrong sort', () => {
    expect(decodeCursor('title', '%%%')).toBeNull();
    expect(decodeCursor('new', encodeCursor('title', '1ก', 'a'))).toBeNull();
    expect(decodeCursor('year', encodeCursor('new', 1_790_000_000_000, 'a'))).toBeNull();
    expect(decodeCursor('new', encodeCursor('year', 1998, 'a'))).toBeNull();
  });
});
