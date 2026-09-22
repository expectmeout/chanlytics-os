/**
 * How the dashboard reaches the edge: where it is, and what a call carries.
 *
 * The address was a literal in five files; it is one variable now, EDGE_URL,
 * with the old literal as its default so nothing moves until it is set (a
 * preview pointed at a staging edge is then one variable away). The
 * credential was one shared key in a header; a call now carries a token
 * minted for the door it opens (packages/channels edge-token), bound to the
 * workspace and the person, valid for a minute, when EDGE_CALL_SECRET is set,
 * and the shared key for as long as DIAG_KEY still is. The edge decides which
 * it honours (apps/edge/lib/admin-auth.ts).
 */
import { signEdgeToken } from "@chanlytics/channels";

const DEFAULT_EDGE_URL = "https://chanlytics-messaging.vercel.app";

/** The edge's origin, no trailing slash. */
export function edgeUrl(): string {
  return (process.env.EDGE_URL || DEFAULT_EDGE_URL).replace(/\/+$/, "");
}

/** Whether this deployment holds any credential the edge would honour. */
export function edgeConfigured(): boolean {
  return !!(process.env.EDGE_CALL_SECRET || process.env.DIAG_KEY);
}

/** The headers a call to the door at `aud` carries. */
export function edgeHeaders(
  aud: string,
  ctx: { workspace?: string | null; user?: string | null } = {},
): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env.EDGE_CALL_SECRET;
  if (secret) h["x-edge-token"] = signEdgeToken(secret, aud, ctx);
  if (process.env.DIAG_KEY) h["x-diag-key"] = process.env.DIAG_KEY;
  return h;
}
