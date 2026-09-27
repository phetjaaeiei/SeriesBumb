import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { supabaseImageStore } from '../../../../lib/services/supabase-image-store';

export const GET: APIRoute = async ({ params, locals }) => {
  if (locals.user?.role !== 'admin') return new Response(null, { status: 403 });
  const row = await env.DB.prepare('SELECT fullKey FROM tape_image WHERE id = ?').bind(params.imageId).first<{ fullKey: string }>();
  if (!row) return new Response(null, { status: 404 });
  const object = await supabaseImageStore(env).get(row.fullKey);
  if (!object) return new Response(null, { status: 404 });
  return new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
};
