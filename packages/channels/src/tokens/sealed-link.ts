/**
 * A link that names a workspace, a person and one email, sealed: what the unsubscribe link (unsubscribe-token.ts) and
 * the sign-up's confirmation link (confirm-token.ts) both carry. Each seals under its own label, so a link of one kind
 * never opens as the other, whichever secret both use.
 *
 * 65 bytes as base64url, 87 characters: a version, three uuids of 16 bytes each, and the first 16 bytes of an
 * HMAC-SHA256 over them under the secret, after the label. A link is opened under the current secret or, while a
 * rotation settles, the one before it.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { UUID } from "@chanlytics/contracts";

/** What a link seals: whose it is, and the email it came in. */
export interface SealedClaims {
  tenantId: string;
  contactId: string;
  messageId: string;
}

const VERSION = 1;
const PAYLOAD_BYTES = 1 + 16 * 3;
const MAC_BYTES = 16;
const TOKEN = /^[A-Za-z0-9_-]{87}$/;

const bytesOf = (uuid: string): Buffer => Buffer.from(uuid.replace(/-/g, ""), "hex");
const uuidOf = (b: Buffer): string => {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const macOf = (label: string, secret: string, payload: Buffer): Buffer =>
  createHmac("sha256", secret).update(label).update(payload).digest().subarray(0, MAC_BYTES);

/** The link's token, sealed under `label` and `secret`; `who` names the caller in what it throws. */
export function sealLink(who: string, label: string, secret: string, c: SealedClaims): string {
  if (!secret) throw new Error(`${who}: no secret`);
  for (const id of [c.tenantId, c.contactId, c.messageId])
    if (!UUID.test(id)) throw new Error(`${who}: the workspace, the person and the email are uuids`);
  const payload = Buffer.concat([
    Buffer.from([VERSION]),
    bytesOf(c.tenantId),
    bytesOf(c.contactId),
    bytesOf(c.messageId),
  ]);
  return Buffer.concat([payload, macOf(label, secret, payload)]).toString("base64url");
}

/**
 * The claims a token seals under `label`, or null for anything that is not a token one of these secrets made. Never
 * throws. A blank secret is skipped.
 */
export function openLink(
  label: string,
  secrets: readonly (string | null | undefined)[],
  token: string,
): SealedClaims | null {
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
  if (!keys.some((k) => timingSafeEqual(mac, macOf(label, k, payload)))) return null;
  return {
    tenantId: uuidOf(payload.subarray(1, 17)),
    contactId: uuidOf(payload.subarray(17, 33)),
    messageId: uuidOf(payload.subarray(33, 49)),
  };
}

/** A link's address: the path under an origin, the token after it. */
export function sealedUrl(origin: string, path: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}${path}${token}`;
}
