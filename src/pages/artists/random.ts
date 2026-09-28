import { db } from '../../platform/runtime';
import type { APIRoute } from 'astro';
import { randomPublicArtist } from '../../repositories/random-artist.repo';

export const GET: APIRoute = async () => {
  const slug = await randomPublicArtist(db());
  return new Response(null, { status: 302, headers: { Location: slug ? `/artists/${encodeURIComponent(slug)}` : '/artists', 'Cache-Control': 'no-store' } });
};
