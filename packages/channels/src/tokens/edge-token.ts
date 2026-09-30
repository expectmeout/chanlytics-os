/**
 * The token a dashboard call carries to an edge door.
 *
 * One shared key (DIAG_KEY) opened every admin door, was compared with `!==`,
 * and never said who was calling for which workspace. This is minted per
 * call: bound to one door (aud), one workspace and one person, valid for a
 * minute, signed with a secret kept for nothing else. The edge verifies it in
 * constant time and takes the workspace from the token, never from the body.
 *
 * It also carries the name of the request it was minted in (`rid`, request-id.ts): signed, so an authorized call's
 * lines are named by what the dashboard said and cannot be relabelled in transit, and a header alone never renames a
 * call whose token verified (the edge's adminDoor, apps/edge/lib/log.ts). A token minted outside a request has none.
 *
 * Pure: no environment, no clock of its own. The dashboard signs
 * (src/server/edge.ts); the edge verifies (lib/admin-auth.ts); one test signs
 * with one and verifies with the other.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { MIN_MS } from "@chanlytics/contracts";
import { requestIdShaped } from "./request-id";

export const EDGE_TOKEN_TTL_MS = MIN_MS;

export interface EdgeClaims {
  /** The door this token opens, as its path: "/api/admin/lines". */
  aud: string;
  /** The workspace the call is for, or null for a call about no workspace. */
  ws: string | null;
  /** The person behind the call, or null. */
  user: string | null;
  iat: number;
  exp: number;
  nonce: string;
  /** The request this call was made in, when the dashboard was serving one: a name shaped by `requestIdShaped`. */
  rid?: string | null;
}

export function signEdgeToken(
  secret: string,
  aud: string,
  ctx: { workspace?: string | null; user?: string | null; request?: string | null } = {},
  nowMs = Date.now(),
): string {
  const rid = requestIdShaped(ctx.request);
  const claims: EdgeClaims = {
    aud,
    ws: ctx.workspace ?? null,
    user: ctx.user ?? null,
    iat: nowMs,
    exp: nowMs + EDGE_TOKEN_TTL_MS,
    nonce: randomBytes(8).toString("hex"),
    ...(rid ? { rid } : {}),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export type EdgeTokenVerdict =
  { ok: true; claims: EdgeClaims } | { ok: false; reason: "malformed" | "signature" | "audience" | "expired" };

/** Signature first, in constant time; only a signed payload is parsed. */
export function verifyEdgeToken(secret: string, token: string, aud: string, nowMs = Date.now()): EdgeTokenVerdict {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: "malformed" };
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "signature" };
  let claims: EdgeClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as EdgeClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!claims || typeof claims !== "object" || typeof claims.aud !== "string")
    return { ok: false, reason: "malformed" };
  if (claims.aud !== aud) return { ok: false, reason: "audience" };
  if (typeof claims.iat !== "number" || typeof claims.exp !== "number") return { ok: false, reason: "malformed" };
  // Expired, or minted in a future further off than the TTL itself (a wrong clock, or a forgery of the time).
  if (nowMs > claims.exp || claims.iat > nowMs + EDGE_TOKEN_TTL_MS) return { ok: false, reason: "expired" };
  return {
    ok: true,
    claims: { ...claims, ws: claims.ws ?? null, user: claims.user ?? null, rid: requestIdShaped(claims.rid) },
  };
}
