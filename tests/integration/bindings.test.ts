import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('Cloudflare test bindings', () => {
  it('provides a usable D1 database', async () => {
    const row = await env.DB.prepare('SELECT 1 AS value').first<{ value: number }>();
    expect(row?.value).toBe(1);
  });
});
