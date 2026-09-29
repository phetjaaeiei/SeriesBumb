// Admin catalog writes: records, relations, credits, sources, images, delete and lookup.
import { db, config, imageStore } from '../platform/runtime';
import { ActionError, defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { defineAdminAction, runAdminAction } from './define';
import { requireFreshSession } from '../auth/permissions';
import { artistSaveSchema, collectionSaveSchema, labelSaveSchema, songSaveSchema, tapeSaveSchema, uploadSchema } from './schemas';
import { createArtist, createCollection, createGenre, createLabel, createSong, createTapeDraft, saveArtist, saveCollection, saveGenre, saveLabel, saveSong, saveTape } from '../services/catalog';
import { deleteTapeImage, uploadImage } from '../services/images';
import { deleteCatalogEntity } from '../services/catalog-delete';
import { normalizeThai } from '../domain/thai';
import { addCatalogSource, deleteCatalogSource } from '../services/catalog-sources';
import { createPerson, linkArtistMember } from '../services/people';
import { addArtistRelation, addTapeEdition, deleteArtistRelation, deleteTapeEdition } from '../services/catalog-relations';
import { addPersonCredit, deletePersonCredit } from '../services/person-credits';
import { runCatalog } from './run';
import { lookupAdminChoices } from '../repositories/admin.repo';

export const adminCatalog = {
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
  sources: {
    add: defineAdminAction({ input: z.object({ entityKind: z.enum(['artist', 'tape', 'song']), entityId: z.uuid(), title: z.string().trim().min(1).max(200), url: z.url().max(2000), claim: z.string().trim().min(1).max(500), accessedAt: z.number().int().min(946684800000).max(4102444800000) }), handler: (input, context) => runCatalog(() => addCatalogSource(db(), context.user.id, input)) }),
    delete: defineAdminAction({ input: z.object({ id: z.uuid() }), handler: ({ id }) => runCatalog(() => deleteCatalogSource(db(), id)) }),
  },
  deleteCatalog: defineAdminAction({
    input: z.object({ kind: z.enum(['tapes', 'songs', 'artists', 'labels', 'genres', 'collections']), id: z.uuid(), confirmation: z.string().max(200).optional() }),
    handler: (input, context) => { requireFreshSession(context.locals); return runCatalog(() => deleteCatalogEntity(db(), imageStore(), input.kind, input.id, input.confirmation, promise => context.locals.cfContext.waitUntil(promise))); },
  }),
  lookup: defineAdminAction({
    input: z.object({ kind: z.enum(['artists', 'labels', 'genres', 'songs', 'tapes']), query: z.string().trim().min(2).max(80) }),
    handler: async ({ kind, query }) => {
      const term = `%${normalizeThai(query).replace(/[\\%_]/gu, '\\$&')}%`;
      return lookupAdminChoices(db(), kind, term);
    },
  }),
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
};
