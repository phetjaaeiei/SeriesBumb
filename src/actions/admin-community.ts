// Admin moderation and member management.
import { db, config } from '../platform/runtime';
import { z } from 'astro/zod';
import { defineAdminAction } from './define';
import { requireFreshSession } from '../auth/permissions';
import { moderateComment, setCommentBan, setUserRole } from '../services/admin-community';
import { moderateCorrection, moderateReview } from '../services/reviews';
import { runComment, runReview } from './run';

export const adminCommunity = {
  reviews: {
    moderate: defineAdminAction({ input: z.object({ id: z.uuid(), status: z.enum(['published', 'rejected']) }), handler: (input, context) => runReview(() => moderateReview(db(), context.user.id, input.id, input.status)) }),
    moderateCorrection: defineAdminAction({ input: z.object({ id: z.uuid(), status: z.enum(['accepted', 'rejected']) }), handler: (input, context) => runReview(() => moderateCorrection(db(), context.user.id, input.id, input.status)) }),
  },
  comments: {
    delete: defineAdminAction({ input: z.object({ id: z.uuid() }), handler: ({ id }, context) => runComment(() => moderateComment(db(), context.user.id, id, false)) }),
    restore: defineAdminAction({ input: z.object({ id: z.uuid() }), handler: ({ id }, context) => runComment(() => moderateComment(db(), context.user.id, id, true)) }),
  },
  users: {
    setRole: defineAdminAction({ input: z.object({ id: z.string().min(1), role: z.enum(['member', 'admin']) }), handler: ({ id, role }, context) => { requireFreshSession(context.locals); return runComment(() => setUserRole(db(), { id: context.user.id, email: context.user.email }, id, role, config().auth.adminEmails)); } }),
    setCommentBan: defineAdminAction({ input: z.object({ id: z.string().min(1), banned: z.boolean() }), handler: ({ id, banned }, context) => { requireFreshSession(context.locals); return runComment(() => setCommentBan(db(), id, banned)); } }),
  },
};
