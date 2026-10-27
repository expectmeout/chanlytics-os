/**
 * Meta's signature over a webhook's raw body: `X-Hub-Signature-256: sha256=<hex HMAC-SHA256 of the body>`, keyed with the
 * app's secret. The WhatsApp Cloud API webhook and the Instagram one are signed the same way (decision 0001: shared is the
 * signature scheme, not the message), so both doors ask this one predicate.
 *
 * FAIL-CLOSED: no secret is a configuration fault, never a check skipped, and a body is proven only by a secret that is
 * set. An app may hold two (an Instagram Login app's Instagram app secret, and the Meta app's own): the body is proven by
 * either, both being the business's own keys. The comparison is constant-time over equal lengths.
 */
import crypto from "node:crypto";

/** The header Meta signs a delivery under. */
export const META_SIGNATURE_HEADER = "x-hub-signature-256";

/** Whether `header` is Meta's signature of `raw` under one of `secrets`; an unset or blank secret proves nothing. */
export function metaSignatureValid(
  raw: string,
  header: string | null | undefined,
  secrets: ReadonlyArray<string | null | undefined>,
): boolean {
  const given = Buffer.from(String(header ?? ""));
  return secrets.some((secret) => {
    if (!secret) return false;
    const expected = Buffer.from("sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex"));
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
