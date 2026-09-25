import { defineAction, type ActionAPIContext } from 'astro:actions';
import { z } from 'astro/zod';
import type { SessionUser } from './types';
import { requireAdmin, requireUser } from './permissions';

type Input = z.ZodType;
type AuthedContext = ActionAPIContext & { user: SessionUser };

export function defineAdminAction<T extends Input, R>(options: {
  input: T;
  handler: (input: z.infer<T>, context: AuthedContext) => Promise<R> | R;
}) {
  return defineAction<R, 'json', T>({
    accept: 'json',
    input: options.input,
    handler: ((input: unknown, context: ActionAPIContext) => options.handler(input as z.infer<T>, { ...context, user: requireAdmin(context.locals) })) as Parameters<typeof defineAction<R, 'json', T>>[0]['handler'],
  });
}

export function defineMemberAction<T extends Input, R>(options: {
  input: T;
  handler: (input: z.infer<T>, context: AuthedContext) => Promise<R> | R;
}) {
  return defineAction<R, 'json', T>({
    accept: 'json',
    input: options.input,
    handler: ((input: unknown, context: ActionAPIContext) => options.handler(input as z.infer<T>, { ...context, user: requireUser(context.locals) })) as Parameters<typeof defineAction<R, 'json', T>>[0]['handler'],
  });
}
