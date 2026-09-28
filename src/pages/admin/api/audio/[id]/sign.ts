import { config, audioEnvironment } from '../../../../../platform/runtime';
import type { APIRoute } from 'astro';
import { signAudio } from '../../../../../services/audio-archive';
import { adminAudioRoute, audioJson } from '../../../../../http/audio-http';

export const POST: APIRoute = context => adminAudioRoute(context, config().siteUrl, true, async () => {
  return audioJson(await signAudio(audioEnvironment(), context.params.id ?? ''));
});
