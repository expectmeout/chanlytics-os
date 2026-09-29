/**
 * Whether a webhook delivery is Resend's: the Svix signature over it, computed and checked inside the replay window.
 * The first thing intake asks; what a delivery carries is intake.ts and receipts.ts.
 */

/** Into a buffer of its own: what importKey is typed to take, and nothing shared with another view. */
const bytesOfBase64 = (s: string): ArrayBuffer => {
  const raw = atob(s);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out.buffer;
};
const base64OfBytes = (b: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(b)));

/** Constant-time, so a wrong signature says nothing about how wrong it was. */
function sameBytes(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/** How far a webhook's clock may be from ours: a captured delivery is not replayable for longer. */
export const WEBHOOK_TOLERANCE_S = 300;

/** The signature Svix computes for one delivery, base64; null when the secret is not one. Exported because a test signs with it, as twilioSignature is. */
export async function resendWebhookSignature(
  secret: string,
  id: string,
  timestamp: string,
  rawBody: string,
): Promise<string | null> {
  let keyBytes: ArrayBuffer;
  try {
    keyBytes = bytesOfBase64(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  } catch {
    return null;
  }
  const key = await globalThis.crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return base64OfBytes(
    await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`)),
  );
}

/**
 * Is this delivery Resend's? Resend signs with Svix: HMAC-SHA256 over
 * `<svix-id>.<svix-timestamp>.<raw body>`, keyed with the bytes behind the
 * endpoint's `whsec_` secret, sent as one or more space-separated `v1,<base64>`
 * entries (more than one while a secret is being rotated). The RAW body, as it
 * arrived: a re-serialised one signs differently. Web Crypto, like the Meta,
 * Twilio and Retell verifiers beside it, so it runs on the edge as it is.
 *
 * It proves who sent the EVENT. It says nothing about who sent the email the
 * event is about.
 */
export async function verifyResendWebhook(
  secret: string | undefined,
  h: SvixHeaders,
  rawBody: string,
  nowMs: number,
): Promise<boolean> {
  if (!secret || !h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > WEBHOOK_TOLERANCE_S) return false;
  const expected = await resendWebhookSignature(secret, h.id, h.timestamp, rawBody);
  if (!expected) return false;
  return h.signature.split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    return version === "v1" && !!sig && sameBytes(sig, expected);
  });
}
