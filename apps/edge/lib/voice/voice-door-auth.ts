/**
 * Who may knock on the voice doors, decided once.
 *
 * Retell reaches this edge through four doors: the call webhook (retell-webhook), the inbound-call webhook that hands
 * the receptionist its facts (retell-inbound), and two custom functions, the booking link (retell-fn) and open times
 * (retell-availability). The webhook has required Retell's signature since 5 Sep 2026. The other three opened for a
 * shared secret, RETELL_FN_SECRET, on the URL (`?key=`) or a header (`x-fn-secret`): a secret that sits in Retell's
 * dashboard, in the agent's tool config and in any access log, and whoever held it could read a workspace's facts and
 * a caller's history back (inbound), or text a stranger the booking link (fn).
 *
 * THE SIGNATURE, CHECKED ONE WAY. `retellSigned` is the webhook's check, moved here so the four doors cannot come to
 * disagree: the badged key (RETELL_WEBHOOK_KEY, the API key when it is unset) over the raw body, then over the body
 * re-serialised, because Retell's own example signs `JSON.stringify(req.body)` and the two differ whenever an encoder
 * escapes non-ASCII.
 *
 * REPORTED BEFORE IT IS REQUIRED. Whether Retell signs the inbound webhook and custom-function calls as it signs the
 * call webhook is a question a delivery answers, not a guess -- retell-fn.ts said it did not, and the webhook's own
 * history is 127 real deliveries turned away by a key that was not the badged one. So every knock logs
 * `voice_door_auth` with what it carried (sig, secret), and the secret still opens the door, compared in constant
 * time. With RETELL_DOORS_SIGNED=1 the signature alone opens it, as it does the webhook: set it once the log shows
 * sig: true on each door.
 */
import crypto from "node:crypto";
import { verifyRetellSignature } from "../packages/channels.js";
import { env } from "../env.js";
import { logger } from "../log.js";

/** Retell's signature over a delivery: the badged key, the raw body, then the body as Retell's example re-serialises it. */
export function retellSigned(
  raw: string,
  header: string | null,
): { ok: boolean; raw: boolean; restringified: boolean } {
  const key = env.RETELL_WEBHOOK_KEY || env.RETELL_API_KEY;
  const sigRaw = verifyRetellSignature(raw, header, key);
  let restringified: string | null = null;
  try {
    restringified = JSON.stringify(JSON.parse(raw));
  } catch {
    /* not JSON: nothing to re-serialise */
  }
  const sigRestringified =
    !sigRaw && restringified !== null && restringified !== raw
      ? verifyRetellSignature(restringified, header, key)
      : sigRaw;
  return { ok: sigRaw || sigRestringified, raw: sigRaw, restringified: sigRestringified };
}

/**
 * The shared secret, compared in constant time. An unset or empty secret matches nothing: an empty key must never open
 * a door because the configured secret is empty too.
 */
function sameSecret(given: string | null, secret: string | undefined): boolean {
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type VoiceDoor = "inbound" | "fn" | "availability";

/**
 * May this knock come in: the signature when RETELL_DOORS_SIGNED=1, the shared secret until then.
 *
 * What a knock carried is logged when it comes in -- which is how the switch gets set on evidence -- and, once the
 * signature is required, when it is turned away too: that refusal may be Retell's, and a door that turned Retell away
 * without a word is how the webhook lost 127 deliveries. Until then a refusal is somebody without the secret, and a
 * public URL does not write a line for each of those.
 */
export function voiceDoorAuth(
  door: VoiceDoor,
  request: Request,
  raw: string,
  presented: string | null,
): { ok: boolean; sig: boolean; secret: boolean } {
  const sig = retellSigned(raw, request.headers.get("x-retell-signature")).ok;
  const secret = sameSecret(presented, env.RETELL_FN_SECRET);
  const signedOnly = env.RETELL_DOORS_SIGNED === "1";
  const ok = signedOnly ? sig : secret;
  if (ok || signedOnly) logger().info("voice_door_auth", { door, sig, secret, signed_only: signedOnly, ok });
  return { ok, sig, secret };
}
