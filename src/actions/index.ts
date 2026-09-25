import { env } from 'cloudflare:workers';
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { defineAdminAction } from '../lib/actions';
import { requireAdmin } from '../lib/permissions';
import { artistSaveSchema, collectionSaveSchema, labelSaveSchema, songSaveSchema, tapeSaveSchema, uploadSchema } from '../lib/schemas';
import { createArtist, createCollection, createGenre, createLabel, createSong, createTapeDraft, saveArtist, saveCollection, saveGenre, saveLabel, saveSong, saveTape } from '../lib/services/catalog';
import { deleteTapeImage, uploadImage } from '../lib/services/images';
import { normalizeThai } from '../lib/thai';

async function runCatalog<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    console.error('Catalog action failed', error instanceof Error ? error.message : 'unknown');
    throw new ActionError({ code: 'BAD_REQUEST', message: 'บันทึกไม่สำเร็จ ตรวจข้อมูลแล้วลองอีกครั้ง' });
  }
}

export const server = {
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
