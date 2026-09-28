import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { deleteAudio, downloadAudio } from '../../../../../lib/services/audio-archive';
import { REAUTH_MESSAGE, isFreshSession } from '../../../../../lib/admin-session';
import { adminAudioRoute, audioJson } from '../../../../../lib/services/audio-http';

export const GET: APIRoute = context => adminAudioRoute(context, env.SITE_URL, false, async () => {
  return downloadAudio(env, context.params.id ?? '');
});

export const DELETE: APIRoute = context => adminAudioRoute(context, env.SITE_URL, true, async () => {
  // Deleting a private original is irreversible: require a sign-in from the last 15 minutes.
  if (!context.locals.session || !isFreshSession(context.locals.session.createdAt, Date.now())) return audioJson({ error: REAUTH_MESSAGE }, 403);
  await deleteAudio(env, context.params.id ?? '');
  return new Response(null, { status: 204 });
});
