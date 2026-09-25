import type { APIRoute } from 'astro';

export const GET: APIRoute = () => new Response(`User-agent: facebookexternalhit
Allow: /

User-agent: *
Disallow: /search
Disallow: /partials/
Disallow: /admin
Disallow: /tapes?
Disallow: /genres/*?
Disallow: /decades/*?
Disallow: /labels/*?
`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
