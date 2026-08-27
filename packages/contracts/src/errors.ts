/** Closed error-code enum for the /api/v1 envelope (Blueprint §4). */
export const ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation",
  "conflict",
  "rate_limited",
  "window_closed",
  "upstream_meta",
  "upstream_retell",
  "upstream_anthropic",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status ?? DEFAULT_STATUS[code];
    this.details = details;
  }
}

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  conflict: 409,
  rate_limited: 429,
  window_closed: 409,
  upstream_meta: 502,
  upstream_retell: 502,
  upstream_anthropic: 502,
  internal: 500,
};
