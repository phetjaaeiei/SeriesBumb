import { env } from 'cloudflare:workers';
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { defineAdminAction, defineMemberAction } from '../lib/actions';
import { requireAdmin } from '../lib/permissions';
import { artistSaveSchema, collectionSaveSchema, labelSaveSchema, songSaveSchema, tapeSaveSchema, uploadSchema } from '../lib/schemas';
import { createArtist, createCollection, createGenre, createLabel, createSong, createTapeDraft, saveArtist, saveCollection, saveGenre, saveLabel, saveSong, saveTape } from '../lib/services/catalog';
import { deleteTapeImage, uploadImage } from '../lib/services/images';
import { setEngagement } from '../lib/services/engagement';
import { CommentError, createComment, deleteOwnComment, listComments } from '../lib/services/comments';
import { moderateComment, setCommentBan, setUserRole } from '../lib/services/admin-community';
import { normalizeThai } from '../lib/thai';

async function runCatalog<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    console.error('Catalog action failed', error instanceof Error ? error.message : 'unknown');
    throw new ActionError({ code: 'BAD_REQUEST', message: 'บันทึกไม่สำเร็จ ตรวจข้อมูลแล้วลองอีกครั้ง' });
  }
}

const commentTargetSchema = z.object({ tapeId: z.uuid().optional(), songId: z.uuid().optional() });
const oneCommentTarget = (input: { tapeId?: string; songId?: string }) => Number(!!input.tapeId) + Number(!!input.songId) === 1;
async function runComment<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error instanceof CommentError) throw new ActionError({ code: error.code, message: error.message });
    console.error('Comment action failed', error instanceof Error ? error.message : 'unknown');
    throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: 'บันทึกไม่สำเร็จ ลองอีกครั้ง' });
  }
}

export const server = {
  comments: {
    list: defineAction({
      input: commentTargetSchema.extend({ cursor: z.string().max(512).nullable().optional() }).refine(oneCommentTarget, 'กรุณาระบุเทปหรือเพลงหนึ่งรายการ'),
      handler: (input, context) => runComment(() => listComments(env.DB, input.tapeId ? { tapeId: input.tapeId } : { songId: input.songId! }, input.cursor, context.locals.user?.id)),
    }),
    create: defineMemberAction({
      input: commentTargetSchema.extend({ body: z.string().max(3000) }).refine(oneCommentTarget, 'กรุณาระบุเทปหรือเพลงหนึ่งรายการ'),
      handler: (input, context) => runComment(() => createComment(env.DB, context.user.id, context.user.role, input.tapeId ? { tapeId: input.tapeId } : { songId: input.songId! }, input.body)),
    }),
    delete: defineMemberAction({
      input: z.object({ id: z.uuid() }),
      handler: ({ id }, context) => runComment(() => deleteOwnComment(env.DB, context.user.id, id)),
    }),
  },
  engagement: {
    setTapeLike: defineMemberAction({ input: z.object({ tapeId: z.uuid(), liked: z.boolean() }), handler: (input, context) => setEngagement(env.DB, context.user.id, 'tapeLike', input.tapeId, input.liked) }),
    setSongLike: defineMemberAction({ input: z.object({ songId: z.uuid(), liked: z.boolean() }), handler: (input, context) => setEngagement(env.DB, context.user.id, 'songLike', input.songId, input.liked) }),
    setTapeOwned: defineMemberAction({ input: z.object({ tapeId: z.uuid(), owned: z.boolean() }), handler: (input, context) => setEngagement(env.DB, context.user.id, 'tapeOwned', input.tapeId, input.owned) }),
  },
  admin: {
    health: defineAdminAction({
      input: z.object({}),
      handler: (_input, context) => ({ ok: true, userId: context.user.id }),
    }),
    lookup: defineAdminAction({
      input: z.object({ kind: z.enum(['artists', 'labels', 'genres', 'songs', 'tapes']), query: z.string().trim().min(2).max(80) }),
      handler: async ({ kind, query }) => {
        const table = { artists: 'artist', labels: 'label', genres: 'genre', songs: 'song', tapes: 'tape' }[kind];
        const column = kind === 'songs' || kind === 'tapes' ? 'title' : 'name';
        const term = `%${normalizeThai(query).replace(/[\\%_]/gu, '\\$&')}%`;
        return (await env.DB.prepare(`SELECT id, ${column} AS label FROM ${table} WHERE lower(${column}) LIKE ? ESCAPE '\\' ORDER BY ${column} LIMIT 20`).bind(term).all<{ id: string; label: string }>()).results;
      },
    }),
    comments: {
      delete: defineAdminAction({ input: z.object({ id: z.uuid() }), handler: ({ id }, context) => runComment(() => moderateComment(env.DB, context.user.id, id, false)) }),
      restore: defineAdminAction({ input: z.object({ id: z.uuid() }), handler: ({ id }, context) => runComment(() => moderateComment(env.DB, context.user.id, id, true)) }),
    },
    users: {
      setRole: defineAdminAction({ input: z.object({ id: z.string().min(1), role: z.enum(['member', 'admin']) }), handler: ({ id, role }, context) => runComment(() => setUserRole(env.DB, context.user.id, id, role, env.ADMIN_EMAILS || '')) }),
      setCommentBan: defineAdminAction({ input: z.object({ id: z.string().min(1), banned: z.boolean() }), handler: ({ id, banned }) => runComment(() => setCommentBan(env.DB, id, banned)) }),
    },
    artists: {
      create: defineAdminAction({ input: z.object({ name: z.string().trim().min(1).max(200) }), handler: (input, context) => runCatalog(() => createArtist(env.DB, context.user.id, input.name)) }),
      save: defineAdminAction({ input: artistSaveSchema, handler: (input, context) => runCatalog(() => saveArtist(env.DB, context.user.id, input)) }),
    },
    labels: {
      create: defineAdminAction({ input: z.object({ name: z.string().trim().min(1).max(200) }), handler: (input, context) => runCatalog(() => createLabel(env.DB, context.user.id, input.name)) }),
      save: defineAdminAction({ input: labelSaveSchema, handler: (input, context) => runCatalog(() => saveLabel(env.DB, context.user.id, input)) }),
    },
    genres: {
      create: defineAdminAction({ input: z.object({ name: z.string().trim().min(1).max(200) }), handler: (input) => runCatalog(() => createGenre(env.DB, input.name)) }),
      save: defineAdminAction({ input: z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200), slug: z.string().optional(), position: z.number().int().optional() }), handler: (input) => runCatalog(() => saveGenre(env.DB, input)) }),
    },
    songs: {
      create: defineAdminAction({ input: z.object({ title: z.string().trim().min(1).max(200), artistIds: z.array(z.uuid()).max(20).optional() }), handler: (input, context) => runCatalog(() => createSong(env.DB, context.user.id, input)) }),
      save: defineAdminAction({ input: songSaveSchema, handler: (input, context) => runCatalog(() => saveSong(env.DB, context.user.id, input)) }),
    },
    tapes: {
      createDraft: defineAdminAction({ input: z.object({ title: z.string().max(200).optional() }), handler: (input, context) => runCatalog(() => createTapeDraft(env.DB, context.user.id, input.title)) }),
      save: defineAdminAction({ input: tapeSaveSchema, handler: (input, context) => runCatalog(() => saveTape(env.DB, context.user.id, input)) }),
    },
    collections: {
      create: defineAdminAction({ input: z.object({ title: z.string().trim().min(1).max(200) }), handler: (input, context) => runCatalog(() => createCollection(env.DB, context.user.id, input.title)) }),
      save: defineAdminAction({ input: collectionSaveSchema, handler: (input, context) => runCatalog(() => saveCollection(env.DB, context.user.id, input)) }),
    },
    images: {
      deleteTapeImage: defineAdminAction({
        input: z.object({ imageId: z.uuid() }),
        handler: ({ imageId }, context) => runCatalog(() => deleteTapeImage(env.DB, env.BUCKET, imageId, promise => context.locals.cfContext.waitUntil(promise))),
      }),
      upload: defineAction({
        accept: 'form', input: uploadSchema,
        handler: (input, context) => {
          requireAdmin(context.locals);
          return runCatalog(() => uploadImage(env.DB, env.BUCKET, input));
        },
      }),
    },
  },
};
