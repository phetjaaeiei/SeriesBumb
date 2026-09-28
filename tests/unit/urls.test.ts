import { describe, expect, it } from 'vitest';
import { canonicalUrl, imageUrl, safeInternalPath, safeNextPath, thumbKeyFromFull } from '../../src/domain/urls';

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

  it('builds a Firebase Storage public media URL with the whole key encoded', () => {
    const base = 'https://firebasestorage.googleapis.com/v0/b/seriesbumb-32f9e.firebasestorage.app/o';
    expect(imageUrl('tapes/id/ชื่อ เทป-full.webp', base))
      .toBe(`${base}/tapes%2Fid%2F%E0%B8%8A%E0%B8%B7%E0%B9%88%E0%B8%AD%20%E0%B9%80%E0%B8%97%E0%B8%9B-full.webp?alt=media`);
  });

  it('changes only the full-image filename into its thumbnail filename', () => {
    expect(thumbKeyFromFull('tapes/uuid-full.webp')).toBe('tapes/uuid-thumb.webp');
    expect(thumbKeyFromFull('dir-full.name/uuid-full.jpg')).toBe('dir-full.name/uuid-thumb.jpg');
  });
});

describe('open redirect hardening', () => {
  const site = 'https://seriesbumb.phetjaa.workers.dev';

  it.each(['/.//evil.com', '/a/..//evil.com', `${site}//evil.com`, '/\\evil.com', '/%5Cevil.com', '/%0d%0aLocation:evil'])('rejects %s', (next) => {
    expect(safeNextPath(next, site)).toBe('/');
  });

  it('keeps normal internal paths', () => {
    expect(safeNextPath('/tapes/abc?x=1#top', site)).toBe('/tapes/abc?x=1#top');
    expect(safeNextPath('/artists/%E0%B8%81', site)).toBe('/artists/%E0%B8%81');
  });

  it('safeInternalPath refuses protocol-relative, backslash and control-character targets', () => {
    expect(safeInternalPath('//evil.example/x')).toBeNull();
    expect(safeInternalPath('/\\evil')).toBeNull();
    expect(safeInternalPath('/a\nb')).toBeNull();
    expect(safeInternalPath('https://evil.example')).toBeNull();
    expect(safeInternalPath('/tapes/new-slug')).toBe('/tapes/new-slug');
  });
});
