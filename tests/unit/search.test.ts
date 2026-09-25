import { describe, expect, it } from 'vitest';
import { buildSearchQuery } from '../../src/lib/search';

describe('public search parser', () => {
  it('uses a quoted FTS phrase for long input, including operators', () => {
    expect(buildSearchQuery('OR "รัก"').fts).toBe('"or ""รัก"""');
    expect(buildSearchQuery('เบิร์ดธงไชย').fts).toBe('"เบิร์ดธงไชย"');
  });
  it('uses the indexed prefix path for short input', () => {
    expect(buildSearchQuery('ใจ')).toEqual({ text: 'ใจ', fts: null, prefix: 'ใจ' });
  });
});
