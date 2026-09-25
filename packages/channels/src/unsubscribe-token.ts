/**
 * The unsubscribe link a campaign email carries: whose "stop" it is, sealed.
 *
 * RFC 8058's one click takes no sign-in, so the link is the authority: it names the workspace, the person and the
 * email it came in, and a keyed MAC makes it unforgeable. It never expires. The law wants the way out working for
 * at least thirty days (CAN-SPAM), a stop pressed late must still stop, and all a token can ever do is narrow what
 * may be sent, so a leaked one costs the person nothing they did not ask for.
 *
 * 65 bytes as base64url, 87 characters: a version, three uuids of 16 bytes each, and the first 16 bytes of an
 * HMAC-SHA256 over them under UNSUBSCRIBE_SECRET, which the edge (minting, Reach out Part 3) and the dashboard (the
 * page, apps/dashboard/app/u/[token]) share. The page also opens a link sealed under UNSUBSCRIBE_SECRET_PREVIOUS, so
 * the secret can be rotated without closing a link already sent.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface UnsubscribeClaims {
  tenantId: string;
  contactId: string;
  messageId: string;
}

/** Where the page lives on the dashboard's origin. */
export const UNSUBSCRIBE_PATH = "/u/";

const VERSION = 1;
const PAYLOAD_BYTES = 1 + 16 * 3;
const MAC_BYTES = 16;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{87}$/;

const bytesOf = (uuid: string): Buffer => Buffer.from(uuid.replace(/-/g, ""), "hex");
const uuidOf = (b: Buffer): string => {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const macOf = (secret: string, payload: Buffer): Buffer =>
  createHmac("sha256", secret).update("chanlytics-unsubscribe:").update(payload).digest().subarray(0, MAC_BYTES);

export function signUnsubscribeToken(secret: string, c: UnsubscribeClaims): string {
  if (!secret) throw new Error("signUnsubscribeToken: no secret");
  for (const id of [c.tenantId, c.contactId, c.messageId])
    if (!UUID.test(id)) throw new Error("signUnsubscribeToken: the workspace, the person and the email are uuids");
  const payload = Buffer.concat([
    Buffer.from([VERSION]),
    bytesOf(c.tenantId),
    bytesOf(c.contactId),
    bytesOf(c.messageId),
  ]);
  return Buffer.concat([payload, macOf(secret, payload)]).toString("base64url");
}

/**
 * The claims a token seals, or null for anything that is not a token one of these secrets made. Never throws.
 * `secrets` is the current secret and, while a rotation settles, the one before it: a link already in somebody's
 * inbox must keep working for at least thirty days (CAN-SPAM), so a rotation never closes one. A blank is skipped.
 */
export function verifyUnsubscribeToken(
  secrets: readonly (string | null | undefined)[],
  token: string,
): UnsubscribeClaims | null {
  if (!Array.isArray(secrets)) return null;
  const keys = secrets.filter((s): s is string => typeof s === "string" && s.length > 0);
  if (!keys.length || typeof token !== "string" || !TOKEN.test(token)) return null;
  const raw = Buffer.from(token, "base64url");
  // Only the one spelling this code writes: the decoder ignores a last character's spare bits, and a link that
  // differs from the one sent is not that link.
  if (raw.length !== PAYLOAD_BYTES + MAC_BYTES || raw[0] !== VERSION || raw.toString("base64url") !== token)
    return null;
  const payload = raw.subarray(0, PAYLOAD_BYTES);
  const mac = raw.subarray(PAYLOAD_BYTES);
  if (!keys.some((k) => timingSafeEqual(mac, macOf(k, payload)))) return null;
  return {
    tenantId: uuidOf(payload.subarray(1, 17)),
    contactId: uuidOf(payload.subarray(17, 33)),
    messageId: uuidOf(payload.subarray(33, 49)),
  };
}

/** The link, on an origin: what the footer shows and List-Unsubscribe carries. */
export function unsubscribeUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${UNSUBSCRIBE_PATH}${token}`;
}
