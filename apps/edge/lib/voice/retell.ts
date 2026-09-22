/** Shared Retell webhook signature verification (X-Retell-Signature: v={ts},d={hmac}). */
import crypto from "node:crypto";

export function verifyRetellSignature(
  rawBody: string,
  header: string | null | undefined,
  apiKey: string | undefined,
): boolean {
  if (!header || !apiKey) return false;
  const m = /v=(\d+),d=([0-9a-f]+)/i.exec(String(header));
  if (!m) return false;
  const [, ts, digest] = m;
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1000) return false;
  const expected = crypto
    .createHmac("sha256", apiKey)
    .update(rawBody + ts)
    .digest("hex");
  const a = Buffer.from(digest.toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
