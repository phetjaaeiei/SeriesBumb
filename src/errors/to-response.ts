import { AppError } from './app-error';
import { D1_QUOTA_MESSAGE, isD1QuotaError } from './d1';

type Respond = (body: { error: string }, status: number) => Response;
const json: Respond = (body, status) => Response.json(body, { status });

/**
 * JSON error for API routes. Unknown errors are never reflected or logged here: they can carry
 * provider credentials or private filenames.
 */
export function toJsonError(error: unknown, fallback: string, respond: Respond = json): Response {
  if (error instanceof AppError) return respond({ error: error.message }, error.status);
  if (isD1QuotaError(error)) return respond({ error: D1_QUOTA_MESSAGE }, 503);
  return respond({ error: fallback }, 500);
}
