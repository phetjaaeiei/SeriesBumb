import { db } from '../platform/runtime';
import type { APIRoute } from 'astro';
import { loadRandomTape } from '../loaders/random';

export const GET: APIRoute = async () => {
  const model = await loadRandomTape(db());
  const target = model ? `/tapes/${encodeURIComponent(model.slug)}` : '/';
  return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store' } });
};
