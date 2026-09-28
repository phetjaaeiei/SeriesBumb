import { db, imageStore } from '../../../../platform/runtime';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, locals }) => {
  if (locals.user?.role !== 'admin') return new Response(null, { status: 403 });
  const row = await db().prepare('SELECT fullKey FROM tape_image WHERE id = ?').bind(params.imageId).first<{ fullKey: string }>();
  if (!row) return new Response(null, { status: 404 });
  const object = await imageStore().get(row.fullKey);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
};
