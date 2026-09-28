import { config, audioEnvironment } from '../../../../../platform/runtime';
import type { APIRoute } from 'astro';
import { deleteAudio, downloadAudio } from '../../../../../services/audio-archive';
import { REAUTH_MESSAGE, isFreshSession } from '../../../../../domain/admin-session';
import { adminAudioRoute, audioJson } from '../../../../../http/audio-http';

export const GET: APIRoute = context => adminAudioRoute(context, config().siteUrl, false, async () => {
  return downloadAudio(audioEnvironment(), context.params.id ?? '');
});

export const DELETE: APIRoute = context => adminAudioRoute(context, config().siteUrl, true, async () => {
  // Deleting a private original is irreversible: require a sign-in from the last 15 minutes.
  if (!context.locals.session || !isFreshSession(context.locals.session.createdAt, Date.now())) return audioJson({ error: REAUTH_MESSAGE }, 403);
  await deleteAudio(audioEnvironment(), context.params.id ?? '');
  return new Response(null, { status: 204 });
});
