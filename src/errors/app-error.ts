// One error taxonomy for the whole app. Codes are a subset of Astro's ActionErrorCode, so mapping to
// actions is the identity and mapping to HTTP is one table.

const STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  CONTENT_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

export type AppErrorCode = keyof typeof STATUS;

export function appErrorCodeForStatus(status: number): AppErrorCode {
  return (Object.keys(STATUS) as AppErrorCode[]).find((code) => STATUS[code] === status) ?? 'INTERNAL_SERVER_ERROR';
}

/** An expected failure whose message is safe to show the user (Thai copy). */
export class AppError extends Error {
  readonly status: number;

  constructor(message: string, readonly code: AppErrorCode = 'BAD_REQUEST', options: { cause?: unknown; status?: number } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.status = options.status ?? STATUS[code];
  }
}
