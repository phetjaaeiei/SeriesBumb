import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { finalizeAudio } from '../../../../../lib/services/audio-archive';
import { adminAudioRoute, audioJson } from '../../../../../lib/services/audio-http';

export const POST: APIRoute = context => adminAudioRoute(context, env.SITE_URL, true, async () => {
  return audioJson({ file: await finalizeAudio(env, context.params.id ?? '') });
});
