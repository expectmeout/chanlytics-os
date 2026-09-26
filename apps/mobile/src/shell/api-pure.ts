/**
 * The pure parts of the shell's calls (api.ts): when a token is fresh, which route is a thread, and the site's
 * envelope read. Apart from the wire and the state so a test runs them under node.
 */
import type { Envelope } from "@chanlytics/contracts";

/** A token this close to expiry is asked for again first: a call in flight must not cross the line. */
export const TOKEN_MARGIN_S = 60;
/** How long the page has to answer a token ask before the call gives up. */
export const TOKEN_WAIT_MS = 5000;

export interface Access {
  token: string;
  expires: number;
}

/** Whether a token may still be sent: it exists and expires later than a minute from now. */
export function isFresh(access: Access | null, nowMs: number): boolean {
  return !!access && access.expires * 1000 > nowMs + TOKEN_MARGIN_S * 1000;
}

/**
 * The conversation a hash route names, when it is a thread, and nothing else. The Inbox routes a thread by its
 * own id, "inbox/th-<conversation id>" (toInboxThreadVM); a notification's route says the same; the bare id is
 * taken too. What comes back is the conversation's id, which is what the routes take.
 */
export function threadIdOf(route: string): string | null {
  const m = /^inbox\/(?:th-)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(route);
  return m ? m[1] : null;
}

export class ApiRefusal extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

/** The site's envelope read: its data, or its refusal thrown in its words. */
export function unwrap<T>(status: number, body: unknown): T {
  const env = body as Envelope<T> | null;
  if (env && typeof env === "object" && env.ok === true) return env.data;
  const e = env && typeof env === "object" && env.ok === false ? env.error : null;
  throw new ApiRefusal(e?.code ?? "unknown", e?.message ?? "Something went wrong.", status);
}
