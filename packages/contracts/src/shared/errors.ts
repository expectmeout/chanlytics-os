import type { z } from "zod";

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
  /** The voice agent's provider (ElevenLabs) could not be reached, refused, or is not set up on this deployment. */
  "upstream_voice",
  /** A provider, or the edge asked on our behalf, refused or never answered; no provider named above says which. */
  "upstream_provider",
  /** It could not be done just now, and trying again may do it: a read or a write that failed, or what this deployment has not switched on. */
  "unavailable",
  /** Something failed that nothing here expected. */
  "internal",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** A code that says something failed on our side or a provider's, and nothing a person wrote: its words are a try-again. */
export const isFaultCode = (code: ErrorCode): boolean =>
  code === "internal" || code === "unavailable" || code === "upstream_provider";

/**
 * What a refusal carries beside its words, by its code: one shape for each thing a client acts on (decision 0109), read
 * by shell/refusal.ts. A code not named here carries none. They were `unknown`, in seven shapes nothing declared, so a
 * page that read one read a guess.
 */
export interface ErrorDetailsByCode {
  /** The fields a body breaks, each with its first sentence (route()'s parse); or a chain's issues in order, each said. */
  validation:
    { readonly fields: Readonly<Record<string, string>> } | { readonly issues: readonly { readonly words: string }[] };
  /** How long until the limit lets this through. */
  rate_limited: { readonly retry_after_s: number };
  /** The least role that may, so a page titles the refusal "Owner only" rather than guess it from the sentence. */
  forbidden: { readonly needs: string };
  /** The session ended: sign in again (shell/refusal.ts SESSION_ENDED). */
  unauthorized: { readonly session_ended: true };
  /** The record the person became (shell/refusal.ts combinedInto). */
  not_found: { readonly moved_to: string };
  /** What a rehearsal may still use; or the address a reply will go to, for the member to confirm. */
  conflict: { readonly allowance: unknown } | { readonly confirm_email_to: string };
  /** The edge's reason, the code support reads. */
  upstream_voice: { readonly reason: string };
  upstream_anthropic: { readonly reason: string };
  upstream_retell: { readonly reason: string };
}

/** The details a code's refusal may carry: never, for a code that carries none. */
export type ErrorDetails<C extends ErrorCode = ErrorCode> = C extends keyof ErrorDetailsByCode
  ? ErrorDetailsByCode[C]
  : never;

/**
 * The mark every AppError carries, in the runtime's global symbol registry so that every copy of this module
 * makes the same one.
 *
 * There was more than one copy: each package's build inlined contracts, so the dashboard loaded the AppError in
 * contracts' dist and a second one inside core's, and a refusal a core verb threw was never `instanceof` the class
 * `withRoute` imports. It reached the owner as a 500, "Something went wrong.", instead of the verb's own words and
 * status (the scorecard of 26 September 2026, found by running it). Each dist now imports its siblings' (#1382), so
 * production holds one copy; a test that loads a module from source beside a package's dist still holds two. Asking
 * for the mark instead of the prototype makes every copy recognise every other.
 */
const APP_ERROR = Symbol.for("@chanlytics/contracts:AppError");

/** Whether `value` carries `mark`: what `instanceof` asks of a class every copy of this module must recognise. */
const carries = (value: unknown, mark: symbol): boolean =>
  typeof value === "object" && value !== null && Object.hasOwn(value, mark);

export class AppError<C extends ErrorCode = ErrorCode> extends Error {
  readonly code: C;
  readonly status: number;
  readonly details?: ErrorDetails<C> | undefined;

  constructor(code: C, message: string, status?: number, details?: ErrorDetails<C>) {
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
    return carries(value, APP_ERROR);
  }
}

/** What a failed reply from the database carries, as its client says it: the sentence, and its code where it has one. */
export interface DbReplyFailure {
  readonly message: string;
  readonly code?: string | null | undefined;
}

const DB_FAILURE = Symbol.for("@chanlytics/contracts:DbFailure");

/**
 * A reply from the database that failed, raised with what it knows. `throw new Error(error.message)` kept the sentence
 * and left the code behind, in some 900 places, so nothing above could tell a door's own refusal ("Contact not found.",
 * P0002) from a database that is down: every one reached a person as "Something went wrong." (decision 0114). The label
 * says what was being done, written ahead of the database's sentence as `label: message`; `dbMessage` is the database's
 * sentence alone, the only part a refusal may quote, and `cause` the reply itself. Marked as AppError is, so every copy
 * of this module recognises every other.
 */
export class DbFailure extends Error {
  readonly code: string | null;
  readonly dbMessage: string;

  constructor(reply: DbReplyFailure, label?: string) {
    super(label === undefined ? reply.message : `${label}: ${reply.message}`, { cause: reply });
    this.name = "DbFailure";
    this.code = reply.code ?? null;
    this.dbMessage = reply.message;
    Object.defineProperty(this, DB_FAILURE, { value: true });
  }

  /** `e instanceof DbFailure` is true for a DbFailure made by any copy of this class. */
  static override [Symbol.hasInstance](value: unknown): value is DbFailure {
    return carries(value, DB_FAILURE);
  }
}

/**
 * A new error, keeping the one it replaces: `throw causedBy(new AppError("internal", "Try again."), e)`. Every class of
 * ours takes it without a constructor of its own, and as `Error`'s own option does, it is no field a refusal compared or
 * serialised shows. The log line then says what went wrong, not only what was being tried (decision 0114).
 */
export function causedBy<E extends Error>(failure: E, cause: unknown): E {
  return Object.defineProperty(failure, "cause", {
    value: cause,
    enumerable: false,
    writable: true,
    configurable: true,
  });
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
  upstream_voice: 503,
  upstream_provider: 502,
  unavailable: 503,
  internal: 500,
};

/**
 * The first thing a body breaks, as a sentence a refusal can say: the field and its schema's own words, or null where
 * the body holds. One reading for every door's schema (deals/body.ts, people/doors/person-bodies.ts), so an act
 * tool refuses a card in the words the route would have answered with (the sheets as verbs, 14 Oct 2026).
 */
export function bodyRefusal(schema: z.ZodType, body: unknown): string | null {
  const r = schema.safeParse(body);
  if (r.success) return null;
  const issue = r.error.issues[0];
  if (!issue) return "that is not something this door takes";
  const field = issue.path.map(String).join(".");
  // A schema's own words that name their field already ("valid_until must be a day") are said as they are.
  return field && !issue.message.startsWith(field) ? `${field}: ${issue.message}` : issue.message;
}
