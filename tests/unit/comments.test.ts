import { describe, expect, it } from 'vitest';
import { normalizeComment } from '../../src/lib/services/comments';

describe('comment normalization', () => {
  it('removes control and bidi override characters while preserving readable newlines', () => {
    expect(normalizeComment('  A\u202e\tB\r\n\n\nC  ')).toBe('AB\n\nC');
  });
});
