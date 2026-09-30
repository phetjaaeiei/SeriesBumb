// Local-only Worker for the parity harness: seeds the catalog and mints signed session cookies.
// Never deployed; run through `wrangler dev --config scripts/parity/wrangler.seed.jsonc`.
import { SEED_SIZES, seedCatalog } from '../../tests/fixtures/catalog-seed';

interface SeedEnv { DB: D1Database; PARITY_AUTH_SECRET: string }

async function signCookieValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
  return encodeURIComponent(`${value}.${btoa(String.fromCharCode(...signature))}`);
}

export default {
  async fetch(request: Request, env: SeedEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/seed') return new Response('not found', { status: 404 });
    const sizeName = (url.searchParams.get('size') ?? 'parity') as keyof typeof SEED_SIZES;
    const seeded = await seedCatalog(env.DB, SEED_SIZES[sizeName]);
    const now = Date.now();
    const cookies: Record<string, string> = {};
    for (const user of [seeded.admin, seeded.members[0]]) {
      const token = crypto.randomUUID().replaceAll('-', '');
      await env.DB.prepare('INSERT INTO session (id, token, userId, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), token, user.id, now + 86_400_000, now, now).run();
      cookies[user.role] = `better-auth.session_token=${await signCookieValue(token, env.PARITY_AUTH_SECRET)}`;
    }
    return Response.json({ cookies, adminEmail: seeded.admin.email, tapes: seeded.tapeIds.length });
  },
};
