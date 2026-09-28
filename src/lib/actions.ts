import { ActionError, defineAction, type ActionAPIContext } from 'astro:actions';
import { z } from 'astro/zod';
import { env } from 'cloudflare:workers';
import { getConfig, isProduction } from '../config/config';
import { RATE_LIMITED_MESSAGE, rateLimiter } from './rate-limit';
import { UNAUDITED_ACTIONS, adminActionNameFrom, auditTargetFromInput, withAudit } from './services/audit';
import { TURNSTILE_FAILED_MESSAGE, verifyTurnstile } from './turnstile';
import type { SessionUser } from './types';
import { requireAdmin, requireUser } from './permissions';

type Input = z.ZodType;
type AuthedContext = ActionAPIContext & { user: SessionUser };

const statusOfActionError = (error: unknown) => (error instanceof ActionError ? ActionError.codeToStatus(error.code) : 500);

/**
 * Requires an admin, then runs the write and records it in the audit log. Lives in the action
 * layer (not middleware) so RPC and `?_action=` form calls are both covered and the target id
 * comes from input that already passed zod validation.
 */
export async function runAdminAction<R>(context: ActionAPIContext, input: unknown, run: (user: SessionUser) => Promise<R> | R): Promise<R> {
  const user = requireAdmin(context.locals);
  const action = adminActionNameFrom(context.url);
  if (!action || UNAUDITED_ACTIONS.has(action)) return run(user);
  return withAudit(env.DB, { actor: user, action, targetId: auditTargetFromInput(input) }, () => run(user), statusOfActionError);
}

export function defineAdminAction<T extends Input, R>(options: {
  input: T;
  handler: (input: z.infer<T>, context: AuthedContext) => Promise<R> | R;
}) {
  return defineAction<R, 'json', T>({
    accept: 'json',
    input: options.input,
    handler: ((input: unknown, context: ActionAPIContext) => runAdminAction(context, input, (user) => options.handler(input as z.infer<T>, { ...context, user }))) as Parameters<typeof defineAction<R, 'json', T>>[0]['handler'],
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

/**
 * Member action that writes to D1: same auth as defineMemberAction plus a per-user rate limit.
 * With `turnstile: true` it also requires a valid `turnstileToken` once Turnstile is configured.
 */
export function defineMemberWriteAction<T extends Input, R>(options: {
  input: T;
  turnstile?: boolean;
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
      const config = getConfig(env);
      if (options.turnstile && config.turnstile) {
        const passed = await verifyTurnstile({
          secret: config.turnstile.secretKey,
          token: (input as { turnstileToken?: string }).turnstileToken,
          ip: context.request.headers.get('cf-connecting-ip'),
          hostname: new URL(config.siteUrl).hostname,
          allowTestKeys: !isProduction(config),
        });
        if (!passed) throw new ActionError({ code: 'FORBIDDEN', message: TURNSTILE_FAILED_MESSAGE });
      }
      return options.handler(input as z.infer<T>, { ...context, user });
    }) as Parameters<typeof defineAction<R, 'json', T>>[0]['handler'],
  });
}
