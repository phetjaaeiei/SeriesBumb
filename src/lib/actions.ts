import { ActionError, defineAction, type ActionAPIContext } from 'astro:actions';
import { z } from 'astro/zod';
import { env } from 'cloudflare:workers';
import { RATE_LIMITED_MESSAGE, rateLimiter } from './rate-limit';
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

/** Member action that writes to D1: same auth as defineMemberAction plus a per-user rate limit. */
export function defineMemberWriteAction<T extends Input, R>(options: {
  input: T;
  handler: (input: z.infer<T>, context: AuthedContext) => Promise<R> | R;
}) {
  return defineAction<R, 'json', T>({
    accept: 'json',
    input: options.input,
    handler: (async (input: unknown, context: ActionAPIContext) => {
      const user = requireUser(context.locals);
      if (!await rateLimiter(env.WRITE_RATE_LIMITER).allow(`write:${user.id}`)) {
        throw new ActionError({ code: 'TOO_MANY_REQUESTS', message: RATE_LIMITED_MESSAGE });
      }
      return options.handler(input as z.infer<T>, { ...context, user });
    }) as Parameters<typeof defineAction<R, 'json', T>>[0]['handler'],
  });
}
