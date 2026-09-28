import { db, config, imageStore } from '../platform/runtime';
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { defineAdminAction, defineMemberAction, defineMemberWriteAction, runAdminAction } from './define';
import { requireFreshSession } from '../auth/permissions';
import { artistSaveSchema, collectionSaveSchema, labelSaveSchema, songSaveSchema, tapeSaveSchema, uploadSchema } from './schemas';
import { createArtist, createCollection, createGenre, createLabel, createSong, createTapeDraft, saveArtist, saveCollection, saveGenre, saveLabel, saveSong, saveTape } from '../services/catalog';
import { deleteTapeImage, uploadImage } from '../services/images';
import { setEngagement } from '../services/engagement';
import { CommentError, createComment, deleteOwnComment, listComments } from '../services/comments';
import { moderateComment, setCommentBan, setUserRole } from '../services/admin-community';
import { continueReindex, enqueueFullReindex } from '../services/search-admin';
import { CatalogError, deleteCatalogEntity } from '../services/catalog-delete';
import { normalizeThai } from '../domain/thai';
import { addCatalogSource, deleteCatalogSource } from '../services/catalog-sources';
import { ReviewError, moderateCorrection, moderateReview, submitCorrection, submitReview } from '../services/reviews';
import { createPerson, linkArtistMember } from '../services/people';
import { addArtistRelation, addTapeEdition, deleteArtistRelation, deleteTapeEdition } from '../services/catalog-relations';
import { addPersonCredit, deletePersonCredit } from '../services/person-credits';

const turnstileToken = z.string().max(2048).optional();

async function runCatalog<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error instanceof CatalogError) throw new ActionError({ code: 'BAD_REQUEST', message: error.message });
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

async function runReview<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error instanceof ReviewError) throw new ActionError({ code: error.code, message: error.message });
    console.error('Review action failed', error instanceof Error ? error.message : 'unknown');
    throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: 'บันทึกไม่สำเร็จ ลองอีกครั้ง' });
  }
}

export const server = {
  reviews: {
    submit: defineMemberWriteAction({ turnstile: true, input: z.object({ tapeId: z.uuid(), rating: z.number().int().min(1).max(5), body: z.string().max(3000), turnstileToken }), handler: (input, context) => runReview(() => submitReview(db(), context.user.id, input.tapeId, input.rating, input.body)) }),
    correct: defineMemberWriteAction({ turnstile: true, input: z.object({ targetKind: z.enum(['artist', 'tape', 'song']), targetId: z.uuid(), proposedChange: z.string().max(2000), sourceUrl: z.string().max(2000).optional(), turnstileToken }), handler: (input, context) => runReview(() => submitCorrection(db(), context.user.id, input.targetKind, input.targetId, input.proposedChange, input.sourceUrl)) }),
  },
  comments: {
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
  },
  engagement: {
    setTapeLike: defineMemberWriteAction({ input: z.object({ tapeId: z.uuid(), liked: z.boolean() }), handler: (input, context) => setEngagement(db(), context.user.id, 'tapeLike', input.tapeId, input.liked) }),
    setSongLike: defineMemberWriteAction({ input: z.object({ songId: z.uuid(), liked: z.boolean() }), handler: (input, context) => setEngagement(db(), context.user.id, 'songLike', input.songId, input.liked) }),
    setTapeOwned: defineMemberWriteAction({ input: z.object({ tapeId: z.uuid(), owned: z.boolean() }), handler: (input, context) => setEngagement(db(), context.user.id, 'tapeOwned', input.tapeId, input.owned) }),
  },
  admin: {
    credits: {
      add: defineAdminAction({ input: z.object({ personId: z.uuid(), targetKind: z.enum(['tape', 'song']), targetId: z.uuid(), creditedAs: z.string().trim().min(1).max(100), role: z.string().trim().min(1).max(100), sourceId: z.uuid() }), handler: input => runCatalog(() => addPersonCredit(db(), input)) }),
      delete: defineAdminAction({ input: z.object({ id: z.uuid() }), handler: ({ id }) => runCatalog(() => deletePersonCredit(db(), id)) }),
    },
    relations: {
      addArtist: defineAdminAction({ input: z.object({ artistId: z.uuid(), relatedArtistId: z.uuid(), relationType: z.enum(['former_name', 'collaboration', 'related']), sourceId: z.uuid() }), handler: input => runCatalog(() => addArtistRelation(db(), input.artistId, input.relatedArtistId, input.relationType, input.sourceId)) }),
      deleteArtist: defineAdminAction({ input: z.object({ id: z.uuid() }), handler: ({ id }) => runCatalog(() => deleteArtistRelation(db(), id)) }),
      addEdition: defineAdminAction({ input: z.object({ tapeId: z.uuid(), relatedTapeId: z.uuid(), format: z.enum(['cassette', 'cd', 'digital', 'other']), editionYear: z.number().int().min(1900).max(2100).nullable(), note: z.string().max(300), sourceId: z.uuid() }), handler: input => runCatalog(() => addTapeEdition(db(), input.tapeId, input.relatedTapeId, input.format, input.editionYear, input.note, input.sourceId)) }),
      deleteEdition: defineAdminAction({ input: z.object({ id: z.uuid() }), handler: ({ id }) => runCatalog(() => deleteTapeEdition(db(), id)) }),
    },
    people: {
      create: defineAdminAction({ input: z.object({ name: z.string().trim().min(1).max(100) }), handler: ({ name }) => runCatalog(() => createPerson(db(), name)) }),
      link: defineAdminAction({ input: z.object({ memberId: z.uuid(), personId: z.uuid().nullable(), sourceId: z.uuid().nullable() }), handler: input => runCatalog(() => linkArtistMember(db(), input.memberId, input.personId, input.sourceId)) }),
    },
    reviews: {
      moderate: defineAdminAction({ input: z.object({ id: z.uuid(), status: z.enum(['published', 'rejected']) }), handler: (input, context) => runReview(() => moderateReview(db(), context.user.id, input.id, input.status)) }),
      moderateCorrection: defineAdminAction({ input: z.object({ id: z.uuid(), status: z.enum(['accepted', 'rejected']) }), handler: (input, context) => runReview(() => moderateCorrection(db(), context.user.id, input.id, input.status)) }),
    },
    sources: {
      add: defineAdminAction({ input: z.object({ entityKind: z.enum(['artist', 'tape', 'song']), entityId: z.uuid(), title: z.string().trim().min(1).max(200), url: z.url().max(2000), claim: z.string().trim().min(1).max(500), accessedAt: z.number().int().min(946684800000).max(4102444800000) }), handler: (input, context) => runCatalog(() => addCatalogSource(db(), context.user.id, input)) }),
      delete: defineAdminAction({ input: z.object({ id: z.uuid() }), handler: ({ id }) => runCatalog(() => deleteCatalogSource(db(), id)) }),
    },
    health: defineAdminAction({
      input: z.object({}),
      handler: (_input, context) => ({ ok: true, userId: context.user.id }),
    }),
    deleteCatalog: defineAdminAction({
      input: z.object({ kind: z.enum(['tapes', 'songs', 'artists', 'labels', 'genres', 'collections']), id: z.uuid(), confirmation: z.string().max(200).optional() }),
      handler: (input, context) => { requireFreshSession(context.locals); return runCatalog(() => deleteCatalogEntity(db(), imageStore(), input.kind, input.id, input.confirmation, promise => context.locals.cfContext.waitUntil(promise))); },
    }),
    lookup: defineAdminAction({
      input: z.object({ kind: z.enum(['artists', 'labels', 'genres', 'songs', 'tapes']), query: z.string().trim().min(2).max(80) }),
      handler: async ({ kind, query }) => {
        const table = { artists: 'artist', labels: 'label', genres: 'genre', songs: 'song', tapes: 'tape' }[kind];
        const column = kind === 'songs' || kind === 'tapes' ? 'title' : 'name';
        const term = `%${normalizeThai(query).replace(/[\\%_]/gu, '\\$&')}%`;
        return (await db().prepare(`SELECT id, ${column} AS label FROM ${table} WHERE lower(${column}) LIKE ? ESCAPE '\\' ORDER BY ${column} LIMIT 20`).bind(term).all<{ id: string; label: string }>()).results;
      },
    }),
    comments: {
      delete: defineAdminAction({ input: z.object({ id: z.uuid() }), handler: ({ id }, context) => runComment(() => moderateComment(db(), context.user.id, id, false)) }),
      restore: defineAdminAction({ input: z.object({ id: z.uuid() }), handler: ({ id }, context) => runComment(() => moderateComment(db(), context.user.id, id, true)) }),
    },
    users: {
      setRole: defineAdminAction({ input: z.object({ id: z.string().min(1), role: z.enum(['member', 'admin']) }), handler: ({ id, role }, context) => { requireFreshSession(context.locals); return runComment(() => setUserRole(db(), { id: context.user.id, email: context.user.email }, id, role, config().auth.adminEmails)); } }),
      setCommentBan: defineAdminAction({ input: z.object({ id: z.string().min(1), banned: z.boolean() }), handler: ({ id, banned }, context) => { requireFreshSession(context.locals); return runComment(() => setCommentBan(db(), id, banned)); } }),
    },
    search: {
      continue: defineAdminAction({ input: z.object({}), handler: () => continueReindex(db()) }),
      rebuild: defineAdminAction({ input: z.object({}), handler: () => enqueueFullReindex(db()) }),
    },
    artists: {
      create: defineAdminAction({ input: z.object({ name: z.string().trim().min(1).max(200) }), handler: (input, context) => runCatalog(() => createArtist(db(), context.user.id, input.name)) }),
      save: defineAdminAction({ input: artistSaveSchema, handler: (input, context) => runCatalog(() => saveArtist(db(), context.user.id, input)) }),
    },
    labels: {
      create: defineAdminAction({ input: z.object({ name: z.string().trim().min(1).max(200) }), handler: (input, context) => runCatalog(() => createLabel(db(), context.user.id, input.name)) }),
      save: defineAdminAction({ input: labelSaveSchema, handler: (input, context) => runCatalog(() => saveLabel(db(), context.user.id, input)) }),
    },
    genres: {
      create: defineAdminAction({ input: z.object({ name: z.string().trim().min(1).max(200) }), handler: (input) => runCatalog(() => createGenre(db(), input.name)) }),
      save: defineAdminAction({ input: z.object({ id: z.uuid(), name: z.string().trim().min(1).max(200), slug: z.string().optional(), position: z.number().int().optional() }), handler: (input) => runCatalog(() => saveGenre(db(), input)) }),
    },
    songs: {
      create: defineAdminAction({ input: z.object({ title: z.string().trim().min(1).max(200), artistIds: z.array(z.uuid()).max(20).optional() }), handler: (input, context) => runCatalog(() => createSong(db(), context.user.id, input)) }),
      save: defineAdminAction({ input: songSaveSchema, handler: (input, context) => runCatalog(() => saveSong(db(), context.user.id, input)) }),
    },
    tapes: {
      createDraft: defineAdminAction({ input: z.object({ title: z.string().max(200).optional() }), handler: (input, context) => runCatalog(() => createTapeDraft(db(), context.user.id, input.title)) }),
      save: defineAdminAction({ input: tapeSaveSchema, handler: (input, context) => runCatalog(() => saveTape(db(), context.user.id, input, imageStore(), promise => context.locals.cfContext.waitUntil(promise))) }),
    },
    collections: {
      create: defineAdminAction({ input: z.object({ title: z.string().trim().min(1).max(200) }), handler: (input, context) => runCatalog(() => createCollection(db(), context.user.id, input.title)) }),
      save: defineAdminAction({ input: collectionSaveSchema, handler: (input, context) => runCatalog(() => saveCollection(db(), context.user.id, input)) }),
    },
    images: {
      deleteTapeImage: defineAdminAction({
        input: z.object({ imageId: z.uuid() }),
        handler: ({ imageId }, context) => runCatalog(() => deleteTapeImage(db(), imageStore(), imageId, promise => context.locals.cfContext.waitUntil(promise))),
      }),
      upload: defineAction({
        accept: 'form', input: uploadSchema,
        handler: (input, context) => runAdminAction(context, input, () => {
          if (!config().images.uploadsEnabled) {
            throw new ActionError({ code: 'SERVICE_UNAVAILABLE', message: 'พักการอัปโหลดรูปเพื่อควบคุมพื้นที่จัดเก็บ' });
          }
          return runCatalog(() => uploadImage(db(), imageStore(), input));
        }),
      }),
    },
  },
};
