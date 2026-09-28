import { db } from '../../platform/runtime';
import type { APIRoute } from 'astro';
import { loadRandomArtist } from '../../loaders/artist-random';

export const GET: APIRoute = async () => {
  const model = await loadRandomArtist(db());
  return new Response(null, { status: 302, headers: { Location: model ? `/artists/${encodeURIComponent(model.slug)}` : '/artists', 'Cache-Control': 'no-store' } });
};
