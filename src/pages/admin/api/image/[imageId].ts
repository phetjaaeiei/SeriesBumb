import { db, imageStore } from '../../../../platform/runtime';
import type { APIRoute } from 'astro';
import { loadAdminTapeImage } from '../../../../loaders/admin/tape-image';

export const GET: APIRoute = async ({ params, locals }) => {
  if (locals.user?.role !== 'admin') return new Response(null, { status: 403 });
  const row = await loadAdminTapeImage(db(), params.imageId);
  if (!row) return new Response(null, { status: 404 });
  const object = await imageStore().get(row.fullKey);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
};
