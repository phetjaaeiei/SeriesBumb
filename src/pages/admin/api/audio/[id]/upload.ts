import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { uploadAudio } from '../../../../../lib/services/audio-archive';
import { adminAudioRoute, audioJson } from '../../../../../lib/services/audio-http';

export const PUT: APIRoute = context => adminAudioRoute(context, env.SITE_URL, true, async () => {
  return audioJson({ file: await uploadAudio(env, context.params.id ?? '', context.request) });
});
