/**
 * Meta's signed request: what Meta posts to an app when a business removes it (the deauthorize callback of an app that
 * signs owners in). Two base64url parts joined by a dot: an HMAC-SHA256 of the second part, keyed by the app's secret,
 * and a JSON payload naming who (`user_id`), how it was signed (`algorithm`) and when (`issued_at`).
 *
 * Read here, where the wire is known, and trusted only once the signature holds under one of the app's secrets (two
 * while a secret is being rotated). Pure, so the tests run it with no network.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { recordOrEmpty } from "@chanlytics/contracts";

/** What a signed request says, once its signature holds. */
export interface MetaSignedRequest {
  /** Meta's id for whose sign-in was removed. */
  userId: string;
  /** When Meta issued it, in seconds since 1970; null where it did not say. */
  issuedAt: number | null;
}

const signatureHolds = (signature: Buffer, payload: string, secret: string): boolean => {
  const expected = createHmac("sha256", secret).update(payload).digest();
  return expected.length === signature.length && timingSafeEqual(expected, signature);
};

/** A signed request, read: null where it is not two parts, names no person, or no secret given signed it. */
export function readMetaSignedRequest(
  signed: string,
  secrets: readonly (string | null | undefined)[],
): MetaSignedRequest | null {
  const [signaturePart, payloadPart, ...more] = signed.trim().split(".");
  if (!signaturePart || !payloadPart || more.length > 0) return null;
  const signature = Buffer.from(signaturePart, "base64url");
  const held = secrets.filter((secret): secret is string => !!secret);
  if (!held.some((secret) => signatureHolds(signature, payloadPart, secret))) return null;
  let payload: Record<string, unknown>;
  try {
    payload = recordOrEmpty(JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")));
  } catch {
    // Signed, and not JSON: nothing in it can be read.
    return null;
  }
  const { user_id: userId, issued_at: issuedAt, algorithm } = payload;
  if (typeof algorithm === "string" && algorithm.toUpperCase() !== "HMAC-SHA256") return null;
  const id = typeof userId === "string" ? userId : typeof userId === "number" ? String(userId) : "";
  return /^\d{5,32}$/.test(id) ? { userId: id, issuedAt: typeof issuedAt === "number" ? issuedAt : null } : null;
}
