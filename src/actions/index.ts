import { z } from 'astro/zod';
import { defineAdminAction } from '../lib/actions';

export const server = {
  admin: {
    health: defineAdminAction({
      input: z.object({}),
      handler: (_input, context) => ({ ok: true, userId: context.user.id }),
    }),
  },
};
