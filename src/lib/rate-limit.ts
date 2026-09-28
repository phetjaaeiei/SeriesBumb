// Workers Rate Limiting binding: free, per Cloudflare location, no D1 writes.
// It protects free-tier quotas, so a limiter outage fails open rather than locking members out.
export interface RateLimiter { allow(key: string): Promise<boolean> }

export function rateLimiter(binding: RateLimit | undefined): RateLimiter {
  return {
    async allow(key) {
      if (!binding) return true;
      try { return (await binding.limit({ key })).success; }
      catch { return true; }
    },
  };
}

export const RATE_LIMITED_MESSAGE = 'ทำรายการถี่เกินไป กรุณารอสักครู่แล้วลองใหม่';
