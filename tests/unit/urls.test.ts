import { describe, expect, it } from 'vitest';
import { canonicalUrl, imageUrl, safeNextPath, thumbKeyFromFull } from '../../src/lib/urls';

const SITE = 'https://seriesbumb.example';

describe('safeNextPath', () => {
  it('returns only a same-origin path with its search and hash', () => {
    expect(safeNextPath('/tapes/a?q=1#images', SITE)).toBe('/tapes/a?q=1#images');
    expect(safeNextPath('https://seriesbumb.example/me#owned', SITE)).toBe('/me#owned');
  });

  it.each(['//evil.example/x', '/\\evil.example/x', 'https://evil.example/x', 'javascript:alert(1)', '/login?next=/me', '/api/auth/callback/google', 'http://['])
    ('falls back to home for unsafe callback %s', (next) => {
      expect(safeNextPath(next, SITE)).toBe('/');
    });

  it('falls back to home for an absent callback', () => {
    expect(safeNextPath(null, SITE)).toBe('/');
    expect(safeNextPath(undefined, SITE)).toBe('/');
  });
});

describe('asset and canonical URLs', () => {
  it('builds the same encoded canonical URL from NFC-equivalent paths', () => {
    expect(canonicalUrl('/tapes/Cafe\u0301', `${SITE}/`))
      .toBe(`${SITE}/tapes/Caf%C3%A9`);
  });

  it('joins the image base URL to an encoded R2 key', () => {
    expect(imageUrl('tapes/abc-full.webp', 'https://images.example/'))
      .toBe('https://images.example/tapes/abc-full.webp');
    expect(imageUrl('artists/ชื่อ ศิลปิน-full.webp', 'https://images.example'))
      .toBe('https://images.example/artists/%E0%B8%8A%E0%B8%B7%E0%B9%88%E0%B8%AD%20%E0%B8%A8%E0%B8%B4%E0%B8%A5%E0%B8%9B%E0%B8%B4%E0%B8%99-full.webp');
  });

  it('changes only the full-image filename into its thumbnail filename', () => {
    expect(thumbKeyFromFull('tapes/uuid-full.webp')).toBe('tapes/uuid-thumb.webp');
    expect(thumbKeyFromFull('dir-full.name/uuid-full.jpg')).toBe('dir-full.name/uuid-thumb.jpg');
  });
});
