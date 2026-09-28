import { describe, expect, it } from 'vitest';
import { buildSearchQuery, normalizeSearchField, searchDocument } from '../../src/domain/search';

describe('public search parser', () => {
  it('quotes each useful word and removes FTS operators and Thai tone differences', () => {
    expect(buildSearchQuery('OR "รัก"').fts).toBe('"รัก"');
    expect(buildSearchQuery('เบิร์ด ธงไชย').fts).toBe('"เบิรด" "ธงไชย"');
    expect(normalizeSearchField('ซีรี่ย์-บั้ม')).toBe(normalizeSearchField('ซีรีย์ บั้ม'));
    expect(searchDocument(['เพลง ใหม่', 'ศิลปิน-ไทย'])).toBe(`${normalizeSearchField('เพลง ใหม่')} | ${normalizeSearchField('ศิลปิน-ไทย')}`);
  });
  it('uses the indexed prefix path for short input', () => {
    expect(buildSearchQuery('ใจ')).toEqual({ text: 'ใจ', fts: null, prefix: 'ใจ' });
  });
});
