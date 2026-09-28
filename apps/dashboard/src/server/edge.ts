/**
 * How the dashboard reaches the edge: where it is, and what a call carries.
 *
 * The address was a literal in five files; it is one variable now, EDGE_URL,
 * with the old literal as its default so nothing moves until it is set (a
 * preview pointed at a staging edge is then one variable away). The
 * credential was one shared key in a header; a call now carries a token
 * minted for the door it opens (packages/channels edge-token), bound to the
 * workspace and the person, valid for a minute, when EDGE_CALL_SECRET is set
 * -- and then nothing else. The key rode beside the token on every call, so a
 * token the edge verified bought nothing while a static key that opened every
 * door travelled with it. The shared key rides only while there is no secret
 * to sign with, and the edge must hold the same secret: without it, it reads
 * no token (apps/edge/lib/admin-auth.ts), so the two projects hold it together
 * or not at all.
 */
import { signEdgeToken } from "@chanlytics/channels";
import { MIN_MS } from "@chanlytics/contracts";

const DEFAULT_EDGE_URL = "https://chanlytics-messaging.vercel.app";

/**
 * How long a lambda keeps what the edge said this deployment can do (Google's, billing's, own domains'): five
 * minutes, since the answer changes when an operator sets a key, not between two page loads.
 */
export const READY_TTL_MS = 5 * MIN_MS;

/** The edge's origin, no trailing slash. */
export function edgeUrl(): string {
  return (process.env.EDGE_URL || DEFAULT_EDGE_URL).replace(/\/+$/, "");
}

/** Whether this deployment holds any credential the edge would honour. */
export function edgeConfigured(): boolean {
  return !!(process.env.EDGE_CALL_SECRET || process.env.DIAG_KEY);
}

/**
 * What an edge refusal says, for a route that shows it as it is: its words (`detail`) when it carries them, else its
 * code (`error`), else null. The edge's `error` is a code (contracts' EDGE_ERROR_CODES) and the sentence a person or
 * support reads rides in `detail`; an edge from before that answered the sentence in `error`, which this reads too.
 */
export function edgeRefusalWords(body: Record<string, unknown> | null | undefined): string | null {
  if (typeof body?.detail === "string") return body.detail;
  return typeof body?.error === "string" ? body.error : null;
}

/** The headers a call to the door at `aud` carries. */
export function edgeHeaders(
  aud: string,
  ctx: { workspace?: string | null; user?: string | null } = {},
): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env.EDGE_CALL_SECRET;
  if (secret) h["x-edge-token"] = signEdgeToken(secret, aud, ctx);
  else if (process.env.DIAG_KEY) h["x-diag-key"] = process.env.DIAG_KEY;
  return h;
}
