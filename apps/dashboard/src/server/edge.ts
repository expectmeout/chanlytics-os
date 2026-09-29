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
 * What an edge refusal says, for a route that shows it as it is: its words (`detail`) when it carries some, else its
 * code (`error`), else null. The edge's `error` is a code (contracts' EDGE_ERROR_CODES) and the sentence a person or
 * support reads rides in `detail`; a refusal with no words, or blank ones, falls back to its code, as the platform's
 * page reads one (legacy-bridge/platform.ts).
 */
export function edgeRefusalWords(body: Record<string, unknown> | null | undefined): string | null {
  const detail = typeof body?.detail === "string" ? body.detail.trim() : "";
  if (detail) return detail;
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

/** What an edge door answered: its status and its JSON body, or the status this side gave a call that got none. */
export interface EdgeAnswer {
  status: number;
  body: Record<string, unknown> | null;
}

/** How long a call to the edge waits unless its caller says: a door that calls a provider bounds its own calls under it. */
const EDGE_CALL_TIMEOUT_MS = 20_000;

/** Whether the door said yes on the wire: a 2xx. What it said inside is the caller's to read. */
export const edgeAnswered = (a: EdgeAnswer): boolean => a.status >= 200 && a.status < 300;

/**
 * One call to an edge door: the token for that door (`aud`, its path), a JSON body, and a bound on the wait. Every call
 * the dashboard makes to the edge goes through here, so none waits for ever: nine did, and one hung connection held a
 * member's request until the platform killed it. Never throws: a door that did not answer in time is a 504
 * (`edge_timeout`), one that could not be reached a 503 (`edge_unreachable`), with the network's words in `detail`,
 * read by the caller like any other refusal.
 */
export async function callEdge(
  aud: string,
  body: unknown,
  opts: {
    workspace?: string | null;
    user?: string | null;
    timeoutMs?: number;
    method?: "GET" | "POST";
    fetch?: typeof fetch;
  } = {},
): Promise<EdgeAnswer> {
  const method = opts.method ?? "POST";
  try {
    const r = await (opts.fetch ?? fetch)(`${edgeUrl()}${aud}`, {
      method,
      headers: edgeHeaders(aud, { workspace: opts.workspace ?? null, user: opts.user ?? null }),
      ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? EDGE_CALL_TIMEOUT_MS),
    });
    const parsed: unknown = await r.json().catch(() => null);
    return {
      status: r.status,
      body:
        parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null,
    };
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      status: timedOut ? 504 : 503,
      body: {
        ok: false,
        error: timedOut ? "edge_timeout" : "edge_unreachable",
        detail: e instanceof Error ? e.message : String(e),
      },
    };
  }
}
