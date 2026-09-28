import { describe, expect, it, vi } from 'vitest';
import { verifyTurnstile } from '../../src/lib/turnstile';

function fakeFetch(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body }) as unknown as typeof fetch;
}

describe('verifyTurnstile', () => {
  it('accepts a successful siteverify answer for our hostname', async () => {
    const fetcher = fakeFetch({ success: true, hostname: 'seriesbumb.phetjaa.workers.dev' });
    expect(await verifyTurnstile({ secret: 's', token: 't', ip: '1.2.3.4', hostname: 'seriesbumb.phetjaa.workers.dev', fetcher })).toBe(true);
    const [url, init] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(String((init as RequestInit).body)).toContain('remoteip=1.2.3.4');
  });

  it.each([
    ['a failed challenge', { success: false }],
    ['another hostname', { success: true, hostname: 'evil.example' }],
  ])('rejects %s', async (_name, body) => {
    expect(await verifyTurnstile({ secret: 's', token: 't', ip: null, hostname: 'seriesbumb.phetjaa.workers.dev', fetcher: fakeFetch(body) })).toBe(false);
  });

  it('fails closed without a token or when siteverify is unreachable', async () => {
    expect(await verifyTurnstile({ secret: 's', token: '', ip: null, hostname: 'h', fetcher: fakeFetch({ success: true, hostname: 'h' }) })).toBe(false);
    const broken = vi.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch;
    expect(await verifyTurnstile({ secret: 's', token: 't', ip: null, hostname: 'h', fetcher: broken })).toBe(false);
  });
});
