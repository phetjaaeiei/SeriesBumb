// Admin health check and search index maintenance.
import { db } from '../platform/runtime';
import { z } from 'astro/zod';
import { defineAdminAction } from './define';
import { continueReindex, enqueueFullReindex } from '../services/search-admin';

export const adminSystem = {
  health: defineAdminAction({
    input: z.object({}),
    handler: (_input, context) => ({ ok: true, userId: context.user.id }),
  }),
  search: {
    continue: defineAdminAction({ input: z.object({}), handler: () => continueReindex(db()) }),
    rebuild: defineAdminAction({ input: z.object({}), handler: () => enqueueFullReindex(db()) }),
  },
};
