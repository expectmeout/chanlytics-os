/**
 * Who may open an admin door.
 *
 * A dashboard call carries a token minted for this door (packages/channels
 * edge-token): one door, one workspace, one person, one minute, its own
 * secret. While EDGE_CALL_SECRET is being rolled out the shared key still
 * opens the door, compared in constant time rather than with `!==`. The
 * rules, in order:
 *
 *   - the edge has the secret and a token is presented: the token must
 *     verify; there is no falling back from a bad token to the key;
 *   - the edge has no secret yet: a token is ignored and the key decides,
 *     so the dashboard may be given the secret before or after the edge;
 *   - no token: the key decides.
 *
 * A door that acts on a workspace then asks workspaceFor(): a token that
 * names one is believed over the body, and a body that names another is
 * refused.
 */
import crypto from "node:crypto";
import { json } from "./http.js";
import { verifyEdgeToken } from "./workspace/channels.js";

export type AdminAuth =
  | { ok: true; via: "token" | "key"; workspace: string | null; user: string | null }
  | { ok: false; response: Response };

export function authorizeAdmin(request: Request, aud: string): AdminAuth {
  const token = request.headers.get("x-edge-token");
  const secret = process.env.EDGE_CALL_SECRET;
  if (token && secret) {
    const v = verifyEdgeToken(secret, token, aud);
    if (!v.ok) return { ok: false, response: json(403, { ok: false, error: `token_${v.reason}` }) };
    return { ok: true, via: "token", workspace: v.claims.ws, user: v.claims.user };
  }
  const key = process.env.DIAG_KEY || "";
  const presented = request.headers.get("x-diag-key") || "";
  const a = Buffer.from(presented);
  const b = Buffer.from(key);
  if (!key || !presented || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, response: json(403, { ok: false }) };
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
    return { ok: false, response: json(403, { ok: false, error: "workspace_mismatch" }) };
  }
  return { ok: true, tenantId: auth.workspace ?? fromBody };
}
