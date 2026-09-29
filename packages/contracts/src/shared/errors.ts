/** Closed error-code enum for the /api/v1 envelope (Blueprint §4). */
export const ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation",
  /**
   * The caller belongs to more than one workspace and the request did not say
   * which. Its own code, not `validation`, because the answer is a question to
   * the person ("which business?") rather than a field to fix, and a nightly
   * once read the generic 400 as a billing bug and a phone-number bug for a day.
   */
  "choose_workspace",
  /**
   * The request acts from a partner's seat (0012) on a session that has not shown its second factor (0013). Its own
   * code, not `forbidden`, because the fix is a code from the person's authenticator rather than a different role:
   * the client sends the tab to the second step.
   */
  "mfa_required",
  "conflict",
  "rate_limited",
  /**
   * The workspace itself may not do this until it pays — not the caller, and
   * not their role. Its own code because the fix is a card rather than a
   * different account, and a client that shows "forbidden" for it sends the
   * owner to the wrong page.
   */
  "payment_required",
  "window_closed",
  "upstream_meta",
  "upstream_retell",
  "upstream_anthropic",
  /** The transactional email provider refused or failed. */
  "upstream_email",
  /** Supabase Auth could not be reached — distinct from "not signed in". */
  "upstream_auth",
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * The mark every AppError carries, in the runtime's global symbol registry so that every copy of this module
 * makes the same one.
 *
 * There is more than one copy. Each package's build inlines contracts (`tsup.config.ts`, `noExternal`), so the
 * dashboard loads the AppError in contracts' dist and a second one inside core's; a refusal a core verb throws
 * was never `instanceof` the class `withRoute` imports, and reached the owner as a 500, "Something went wrong.",
 * instead of the verb's own words and status (the scorecard of 26 September 2026, found by running it). Asking
 * for the mark instead of the prototype makes every copy recognise every other.
 */
const APP_ERROR = Symbol.for("@chanlytics/contracts:AppError");

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
    // Not enumerable: a refusal compared or serialised is the same object it always was.
    Object.defineProperty(this, APP_ERROR, { value: true });
  }

  /** `e instanceof AppError` is true for an AppError made by any copy of this class (see APP_ERROR). */
  static override [Symbol.hasInstance](value: unknown): value is AppError {
    return typeof value === "object" && value !== null && (value as { [APP_ERROR]?: unknown })[APP_ERROR] === true;
  }
}

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  choose_workspace: 400,
  mfa_required: 403,
  conflict: 409,
  rate_limited: 429,
  payment_required: 402,
  window_closed: 409,
  upstream_meta: 502,
  upstream_retell: 502,
  upstream_anthropic: 502,
  upstream_email: 502,
  upstream_auth: 503,
  internal: 500,
};
