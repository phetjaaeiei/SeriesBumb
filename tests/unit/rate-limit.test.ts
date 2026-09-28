import { describe, expect, it, vi } from 'vitest';
import { rateLimiter } from '../../src/lib/rate-limit';

describe('rateLimiter', () => {
  it('allows everything when the binding is missing (local dev and tests)', async () => {
    expect(await rateLimiter(undefined).allow('k')).toBe(true);
  });

  it('asks the binding with the given key', async () => {
    const limit = vi.fn().mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false });
    const limiter = rateLimiter({ limit } as unknown as RateLimit);
    expect(await limiter.allow('write:user-1')).toBe(true);
    expect(await limiter.allow('write:user-1')).toBe(false);
    expect(limit).toHaveBeenCalledWith({ key: 'write:user-1' });
  });

  it('fails open when the binding itself errors', async () => {
    const limiter = rateLimiter({ limit: vi.fn().mockRejectedValue(new Error('boom')) } as unknown as RateLimit);
    expect(await limiter.allow('k')).toBe(true);
  });
});
