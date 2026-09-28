import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/config', () => ({
  getConfig: () => { throw new Error('ConfigError: BETTER_AUTH_SECRET'); },
}));

describe('siteUrlOr', () => {
  it('lets page shells (the branded 500 page) render when config is invalid', async () => {
    const { siteUrlOr } = await import('../../src/platform/runtime');
    expect(siteUrlOr('https://fallback.example')).toBe('https://fallback.example');
  });
});
