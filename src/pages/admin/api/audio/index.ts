import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { listAudio, reserveAudio } from '../../../../lib/services/audio-archive';
import { adminAudioRoute, audioJson, readAudioJson } from '../../../../lib/services/audio-http';

export const GET: APIRoute = context => adminAudioRoute(context, env.SITE_URL, false, async () => {
  const url = new URL(context.request.url);
  return audioJson(await listAudio(env, url.searchParams.get('query') ?? '', url.searchParams.get('cursor')));
});

export const POST: APIRoute = context => adminAudioRoute(context, env.SITE_URL, true, async () => {
  return audioJson(await reserveAudio(env, await readAudioJson(context.request), context.locals.user!.id), 201);
});
