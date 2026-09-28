import { ActionError } from 'astro:actions';
import { AppError, type AppErrorCode } from './app-error';
import { D1_QUOTA_MESSAGE, isD1QuotaError } from './d1';

export { D1_QUOTA_MESSAGE };

/**
 * Maps any thrown value to the ActionError the client sees. AppError messages are shown as-is;
 * anything else is logged under `fallback.log` and replaced by `fallback.message`.
 */
export function toActionError(error: unknown, fallback: { code?: AppErrorCode; message: string; log?: string }): ActionError {
  if (error instanceof ActionError) return error;
  if (error instanceof AppError) return new ActionError({ code: error.code, message: error.message });
  if (isD1QuotaError(error)) return new ActionError({ code: 'SERVICE_UNAVAILABLE', message: D1_QUOTA_MESSAGE });
  console.error(fallback.log ?? 'Action failed', error instanceof Error ? error.message : 'unknown');
  return new ActionError({ code: fallback.code ?? 'INTERNAL_SERVER_ERROR', message: fallback.message });
}
