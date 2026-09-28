import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { signAudio } from '../../../../../services/audio-archive';
import { adminAudioRoute, audioJson } from '../../../../../http/audio-http';

export const POST: APIRoute = context => adminAudioRoute(context, env.SITE_URL, true, async () => {
  return audioJson(await signAudio(env, context.params.id ?? ''));
});
