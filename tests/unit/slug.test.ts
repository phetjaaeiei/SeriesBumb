import { describe, expect, it } from 'vitest';
import {
  decodePathSegments,
  normalizePath,
  SLUG_MAX,
  SLUG_RE,
  slugCandidates,
  slugify,
} from '../../src/lib/slug';

describe('slugify', () => {
  it('keeps Thai tone marks and converts mixed Thai and Latin text to a slug', () => {
    expect(slugify('  รวมฮิต Vol. ๒ — ซีรี่ย์บั้ม ')).toBe('รวมฮิต-vol-2-ซีรี่ย์บั้ม');
    expect(slugify('The & Best!')).toBe('the-best');
    expect(slugify('๑๒๓')).toBe('123');
  });

  it('cuts a long base at a word boundary within 50 codepoints', () => {
    expect(slugify('word '.repeat(20))).toBe(Array(10).fill('word').join('-'));
    expect([...slugify('ก'.repeat(52))]).toHaveLength(50);
    expect(slugify(' !!! ')).toBe('');
  });

  it('uses Thai word boundaries when a long title has no spaces', () => {
    expect(slugify('รักเธอ'.repeat(15))).toBe('รักเธอ'.repeat(8));
  });
});

describe('slugCandidates', () => {
  it('offers base, year and artist-qualified retries in one list', () => {
    expect(slugCandidates('potato-life', { year: 2005, qualifierSlug: 'potato' })).toEqual([
      'potato-life-2005',
      'potato-life-2005-potato',
      'potato-life-2005-potato-2',
      'potato-life-2005-potato-3',
      'potato-life-2005-potato-4',
      'potato-life-2005-potato-5',
    ]);
  });

  it('keeps every candidate valid and within 80 codepoints even with a long qualifier', () => {
    const candidates = slugCandidates('ก'.repeat(50), {
      year: 2020,
      qualifierSlug: 'very-long-artist-name-'.repeat(10),
    });
    expect(candidates).toHaveLength(6);
    for (const candidate of candidates) {
      expect([...candidate].length).toBeLessThanOrEqual(SLUG_MAX);
      expect(SLUG_RE.test(candidate)).toBe(true);
    }
    expect([...candidates[1]!].length).toBeLessThanOrEqual(76);
  });

  it('uses numeric retries when there is no qualifier', () => {
    expect(slugCandidates('ชื่อเพลง')).toEqual([
      'ชื่อเพลง', 'ชื่อเพลง-2', 'ชื่อเพลง-3', 'ชื่อเพลง-4', 'ชื่อเพลง-5',
    ]);
  });
});

describe('path decoding', () => {
  it('decodes each segment independently and normalizes it to NFC', () => {
    expect(decodePathSegments('/tapes/Cafe%CC%81/%2F')).toEqual(['tapes', 'Café', '/']);
    expect(normalizePath('/tapes//Cafe%CC%81/')).toBe('/tapes/Café');
    expect(normalizePath('/')).toBe('/');
  });

  it('returns null for malformed percent encoding', () => {
    expect(decodePathSegments('/tapes/%E0%A4%A')).toBeNull();
    expect(normalizePath('/tapes/%E0%A4%A')).toBeNull();
  });
});
