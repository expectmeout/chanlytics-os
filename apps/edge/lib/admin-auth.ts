/**
 * Who may open an admin door.
 *
 * A dashboard call carries a token minted for this door (packages/channels
 * edge-token): one door, one workspace, one person, one minute, its own
 * secret. The shared key (DIAG_KEY) is the platform's: an operator's
 * terminal, the eval harness, the golden probe. The rules, in order:
 *
 *   - the edge has the secret and a token is presented: the token must
 *     verify; there is no falling back from a bad token to the key;
 *   - the edge has the secret and no token: the key opens nothing, unless
 *     the door names the platform's key as its credential for this knock
 *     (`platformKey`: the diagnostic, which nothing mints a token for, and
 *     the one sending-domains op the runbook reserves for the platform, the
 *     lift of a domain held twice). Either way the knock logs
 *     `admin_door_key_only` with the door and whether it came in, so what
 *     still relies on the key can be read off the log;
 *   - the edge has no secret (a preview): a token is ignored and the key
 *     decides.
 *
 * The key rode beside the token on every dashboard call, and alone it opened
 * every door on an edge that could have verified a token: the token bought
 * nothing while the key travelled with it, and a key that leaked opened
 * twenty-two doors for any workspace. The dashboard sends no key once it can
 * sign (src/server/edge.ts), so the two projects hold EDGE_CALL_SECRET
 * together or not at all: an edge without it refuses a dashboard that signs.
 *
 * A door that acts on a workspace then asks workspaceFor(): a token that
 * names one is believed over the body, and a body that names another is
 * refused.
 */
import crypto from "node:crypto";
import { json, refuse } from "./http.js";
import { requestIdOf, verifyEdgeToken } from "./packages/channels.js";
import { env } from "./env.js";
import { bindRequestId, logger } from "./log.js";

type AdminAuth =
  { ok: true; via: "token" | "key"; workspace: string | null; user: string | null } | { ok: false; response: Response };

/** The shared key, compared in constant time. An unset or empty key matches nothing, an empty knock included. */
function sameKey(presented: string | null, key: string | undefined): boolean {
  if (!key || !presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function authorizeAdmin(
  request: Request,
  aud: string,
  opts: {
    /**
     * This knock is the platform's: the key opens it on an edge that holds the secret too. Say why at the call, and
     * decide it per knock where only one op is the platform's (sending-domains reads the body first).
     */
    platformKey?: boolean;
  } = {},
): AdminAuth {
  // The dashboard's name for this request (edge.ts sends it): every line this door logs carries it. A forged one on a
  // knock refused below only labels the refusal's own line.
  bindRequestId(requestIdOf(request.headers, { trustCaller: true }));
  const token = request.headers.get("x-edge-token");
  const secret = env.EDGE_CALL_SECRET;
  if (token && secret) {
    const v = verifyEdgeToken(secret, token, aud);
    if (!v.ok) return { ok: false, response: refuse(403, `token_${v.reason}`) };
    return { ok: true, via: "token", workspace: v.claims.ws, user: v.claims.user };
  }
  if (!sameKey(request.headers.get("x-diag-key"), env.DIAG_KEY)) {
    return { ok: false, response: json(403, { ok: false }) };
  }
  if (secret) {
    // The key alone, where a token could have been presented: the knock the old rule let in, logged either way.
    const ok = opts.platformKey === true;
    logger().info("admin_door_key_only", { door: aud, ok });
    if (!ok) return { ok: false, response: refuse(403, "token_required") };
  }
  return { ok: true, via: "key", workspace: null, user: null };
}

/**
 * The workspace a door acts on: the token's when it names one; the body's
 * otherwise (a key-authorised caller, or a token about no workspace). A body
 * that names another workspace than the token is refused.
 */
export function workspaceFor(
  auth: Extract<AdminAuth, { ok: true }>,
  bodyTenant: unknown,
): { ok: true; tenantId: string | null } | { ok: false; response: Response } {
  const fromBody = typeof bodyTenant === "string" && bodyTenant.trim() ? bodyTenant.trim() : null;
  if (auth.workspace && fromBody && fromBody !== auth.workspace) {
    return { ok: false, response: refuse(403, "workspace_mismatch") };
  }
  return { ok: true, tenantId: auth.workspace ?? fromBody };
}
