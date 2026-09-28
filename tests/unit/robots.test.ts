import { describe, expect, it } from 'vitest';
import { robotsTxt } from '../../src/lib/robots';

describe('robotsTxt', () => {
  it('keeps the production crawl rules and lets Facebook fetch share previews', () => {
    const body = robotsTxt('production');
    expect(body).toContain('User-agent: facebookexternalhit\nAllow: /');
    expect(body).toContain('Disallow: /admin');
    expect(body).not.toMatch(/^Disallow: \/$/mu);
  });

  it('blocks every crawler outside production', () => {
    expect(robotsTxt('staging')).toBe('User-agent: *\nDisallow: /\n');
    expect(robotsTxt('development')).toBe('User-agent: *\nDisallow: /\n');
  });
});
