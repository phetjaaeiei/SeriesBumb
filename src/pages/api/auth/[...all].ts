import type { APIRoute } from 'astro';
import { getAuth } from '../../../lib/auth';

export const prerender = false;

export const GET: APIRoute = ({ request }) => getAuth().handler(request);
export const POST = GET;
