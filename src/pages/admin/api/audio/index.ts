import { config, audioEnvironment } from '../../../../platform/runtime';
import type { APIRoute } from 'astro';
import { listAudio, reserveAudio } from '../../../../services/audio-archive';
import { adminAudioRoute, audioJson, readAudioJson } from '../../../../http/audio-http';

export const GET: APIRoute = context => adminAudioRoute(context, config().siteUrl, false, async () => {
  const url = new URL(context.request.url);
  return audioJson(await listAudio(audioEnvironment(), url.searchParams.get('query') ?? '', url.searchParams.get('cursor')));
});

export const POST: APIRoute = context => adminAudioRoute(context, config().siteUrl, true, async () => {
  return audioJson(await reserveAudio(audioEnvironment(), await readAudioJson(context.request), context.locals.user!.id), 201);
});
