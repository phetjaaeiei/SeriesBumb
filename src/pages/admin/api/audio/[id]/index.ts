import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { deleteAudio, downloadAudio } from '../../../../../lib/services/audio-archive';
import { adminAudioRoute } from '../../../../../lib/services/audio-http';

export const GET: APIRoute = context => adminAudioRoute(context, env.SITE_URL, false, async () => {
  return downloadAudio(env, context.params.id ?? '');
});

export const DELETE: APIRoute = context => adminAudioRoute(context, env.SITE_URL, true, async () => {
  await deleteAudio(env, context.params.id ?? '');
  return new Response(null, { status: 204 });
});
