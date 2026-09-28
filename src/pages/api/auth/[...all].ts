import type { APIRoute } from 'astro';
import { getAuth } from '../../../lib/auth';
import { isAllowedAuthPath } from '../../../lib/auth-routes';

export const prerender = false;

const handle: APIRoute = ({ request, url }) => {
  if (!isAllowedAuthPath(request.method, url.pathname)) {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  return getAuth().handler(request);
};

export const GET = handle;
export const POST = handle;
