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
  /** The voice agent's provider (ElevenLabs) could not be reached, refused, or is not set up on this deployment. */
  "upstream_voice",
  "internal"
];
const APP_ERROR = /* @__PURE__ */ Symbol.for("@chanlytics/contracts:AppError");
export class AppError extends Error {
  code;
  status;
  details;
  constructor(code, message, status, details) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status ?? DEFAULT_STATUS[code];
    this.details = details;
    Object.defineProperty(this, APP_ERROR, { value: true });
  }
  /** `e instanceof AppError` is true for an AppError made by any copy of this class (see APP_ERROR). */
  static [Symbol.hasInstance](value) {
    return typeof value === "object" && value !== null && value[APP_ERROR] === true;
  }
}
const DEFAULT_STATUS = {
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
  upstream_voice: 503,
  internal: 500
};
export function bodyRefusal(schema, body) {
  const r = schema.safeParse(body);
  if (r.success) return null;
  const issue = r.error.issues[0];
  if (!issue) return "that is not something this door takes";
  const field = issue.path.map(String).join(".");
  return field && !issue.message.startsWith(field) ? `${field}: ${issue.message}` : issue.message;
}
