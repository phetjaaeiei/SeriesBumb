import { config, audioEnvironment } from '../../../../../platform/runtime';
import type { APIRoute } from 'astro';
import { finalizeAudio } from '../../../../../services/audio-archive';
import { adminAudioRoute, audioJson } from '../../../../../http/audio-http';

export const POST: APIRoute = context => adminAudioRoute(context, config().siteUrl, true, async () => {
  return audioJson({ file: await finalizeAudio(audioEnvironment(), context.params.id ?? '') });
});
