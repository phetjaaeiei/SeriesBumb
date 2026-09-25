import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const max = await env.DB.prepare('SELECT max(rowid) AS value FROM tape').first<{ value: number | null }>();
  let slug: string | null = null;
  if (max?.value) {
    const rowid = Math.floor(Math.random() * max.value) + 1;
    const first = await env.DB.prepare("SELECT slug FROM tape WHERE status = 'published' AND rowid >= ? ORDER BY rowid LIMIT 1").bind(rowid).first<{ slug: string }>();
    const fallback = first ?? await env.DB.prepare("SELECT slug FROM tape WHERE status = 'published' ORDER BY rowid LIMIT 1").first<{ slug: string }>();
    slug = fallback?.slug ?? null;
  }
  const target = slug ? `/tapes/${encodeURIComponent(slug)}` : '/';
  return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store' } });
};
