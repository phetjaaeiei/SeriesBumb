// Member-facing actions: reviews, corrections, comments and likes/ownership.
import { db } from '../platform/runtime';
import { defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { defineMemberAction, defineMemberWriteAction } from './define';
import { setEngagement } from '../services/engagement';
import { createComment, deleteOwnComment, listComments } from '../services/comments';
import { submitCorrection, submitReview } from '../services/reviews';
import { runComment, runReview } from './run';

const turnstileToken = z.string().max(2048).optional();
const commentTargetSchema = z.object({ tapeId: z.uuid().optional(), songId: z.uuid().optional() });
const oneCommentTarget = (input: { tapeId?: string; songId?: string }) => Number(!!input.tapeId) + Number(!!input.songId) === 1;

export const reviews = {
  submit: defineMemberWriteAction({ turnstile: true, input: z.object({ tapeId: z.uuid(), rating: z.number().int().min(1).max(5), body: z.string().max(3000), turnstileToken }), handler: (input, context) => runReview(() => submitReview(db(), context.user.id, input.tapeId, input.rating, input.body)) }),
  correct: defineMemberWriteAction({ turnstile: true, input: z.object({ targetKind: z.enum(['artist', 'tape', 'song']), targetId: z.uuid(), proposedChange: z.string().max(2000), sourceUrl: z.string().max(2000).optional(), turnstileToken }), handler: (input, context) => runReview(() => submitCorrection(db(), context.user.id, input.targetKind, input.targetId, input.proposedChange, input.sourceUrl)) }),
};
export const comments = {
  list: defineAction({
    input: commentTargetSchema.extend({ cursor: z.string().max(512).nullable().optional() }).refine(oneCommentTarget, 'กรุณาระบุเทปหรือเพลงหนึ่งรายการ'),
    handler: (input, context) => runComment(() => listComments(db(), input.tapeId ? { tapeId: input.tapeId } : { songId: input.songId! }, input.cursor, context.locals.user?.id)),
  }),
  create: defineMemberWriteAction({
    turnstile: true,
    input: commentTargetSchema.extend({ body: z.string().max(1000), turnstileToken }).refine(oneCommentTarget, 'กรุณาระบุเทปหรือเพลงหนึ่งรายการ'),
    handler: (input, context) => runComment(() => createComment(db(), context.user.id, context.user.role, input.tapeId ? { tapeId: input.tapeId } : { songId: input.songId! }, input.body)),
  }),
  delete: defineMemberAction({
    input: z.object({ id: z.uuid() }),
    handler: ({ id }, context) => runComment(() => deleteOwnComment(db(), context.user.id, id)),
  }),
};
export const engagement = {
  setTapeLike: defineMemberWriteAction({ input: z.object({ tapeId: z.uuid(), liked: z.boolean() }), handler: (input, context) => setEngagement(db(), context.user.id, 'tapeLike', input.tapeId, input.liked) }),
  setSongLike: defineMemberWriteAction({ input: z.object({ songId: z.uuid(), liked: z.boolean() }), handler: (input, context) => setEngagement(db(), context.user.id, 'songLike', input.songId, input.liked) }),
  setTapeOwned: defineMemberWriteAction({ input: z.object({ tapeId: z.uuid(), owned: z.boolean() }), handler: (input, context) => setEngagement(db(), context.user.id, 'tapeOwned', input.tapeId, input.owned) }),
};
