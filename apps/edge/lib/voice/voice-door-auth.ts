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
 * escapes non-ASCII. A knock that carries it comes in on any door: the caller signed, so that is the credential.
 *
 * THE SECRET, WHERE A DOOR SAYS SO. Retell's docs (Sep 2026) sign the inbound-call webhook and custom-function calls
 * as they sign the call webhook: `x-retell-signature`, the badged key over the raw body and a timestamp. Whether
 * production's deliveries bear that out is a question a delivery answers, not a guess -- retell-fn.ts once said they
 * did not, and the webhook's own history is 127 real deliveries turned away by a key that was not the badged one. So
 * every knock that comes in logs `voice_door_auth` with what it carried (sig, secret), and the secret still opens a
 * door that lists itself in KEY_READ_FROM below, compared in constant time: a door absent there opens for the
 * signature alone. Read that log knowing the verifier tries ONE key, the badged one: sig: false on the fn and
 * availability doors while the webhook shows true can mean the wrong key, not an unsigned delivery
 * (voice-door-auth.test.mjs pins that a signature under the API key is refused).
 *
 * WHAT IS BUILT, AND WHAT WAITS ON RUBEN. Built and live: the signature check on all four doors; the secret on three
 * of them, each door named in KEY_READ_FROM; the `voice_door_auth` line for every knock let in; and the switch that
 * closes the secret, RETELL_DOORS_SIGNED (signatureOnly below), which is UNSET in production, so the secret still
 * opens the three doors today. Both the switch and the secret are rows of contracts' registry (ai/flags.ts, sunset 17
 * October 2026, a red build a month after it). What waits is Ruben's: read `voice_door_auth` on production from 3
 * October 2026, and when each of the three doors shows sig: true on real deliveries, set RETELL_DOORS_SIGNED=1 (a
 * refusal is then logged too, since it may be Retell's). After a clean week under it, a later change empties
 * KEY_READ_FROM, stops provisioning the secret into the inbound URL and the tools' header, and deletes
 * RETELL_FN_SECRET. Nothing here flips it, and nothing here can: no code path sets the variable.
 *
 * The switch fails closed on its own value: any set value but an explicit off ("0", "false", "off", "no") is the
 * signature-only mode, so "true" or "yes", typed by someone who meant to close the doors, closes them.
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

type VoiceDoor = "inbound" | "fn" | "availability";

/** Values that leave the shared secret open on purpose; a set variable holding anything else closes it. */
const SECRET_KEPT_OPEN = new Set(["0", "false", "off", "no"]);

/**
 * Whether Retell's signature is the only key to the voice doors here: RETELL_DOORS_SIGNED is set, and to anything but
 * an explicit off. Unset stays the weaker mode (Ruben's switch, after the 3 October read); a typo for "1" does not.
 */
export function signatureOnly(): boolean {
  const set = env.RETELL_DOORS_SIGNED;
  return set !== undefined && !SECRET_KEPT_OPEN.has(set.toLowerCase());
}

/**
 * Which doors still read the shared secret beside the signature, and where -- each with its reason. A door absent
 * here reads none.
 *
 *   - inbound: `?key=` on the URL. The inbound-webhook URL Retell was given at provisioning carries it (voice-provision),
 *     and the log has not yet shown sig: true on this door.
 *   - fn, availability: the `x-fn-secret` header the two tools carry (packages/channels voice-shell), for the same
 *     reason; the converger reports a tool without the header as drift.
 */
const KEY_READ_FROM: Partial<Record<VoiceDoor, "query" | "header">> = {
  inbound: "query",
  fn: "header",
  availability: "header",
};

/** The secret this knock carried, read only from where this door says it reads one. */
function presentedSecret(door: VoiceDoor, request: Request): string | null {
  const where = KEY_READ_FROM[door];
  if (where === "query") return new URL(request.url).searchParams.get("key");
  if (where === "header") return request.headers.get("x-fn-secret");
  return null;
}

/**
 * May this knock come in: Retell's signature, always; the shared secret where this door still reads one, until
 * RETELL_DOORS_SIGNED is set.
 *
 * What a knock carried is logged when it comes in -- which is how a door leaves KEY_READ_FROM on evidence -- and, once
 * the signature is required, when it is turned away too: that refusal may be Retell's, and a door that turned Retell
 * away without a word is how the webhook lost 127 deliveries. Until then a refusal is somebody without the secret,
 * and a public URL does not write a line for each of those.
 */
export function voiceDoorAuth(
  door: VoiceDoor,
  request: Request,
  raw: string,
): { ok: boolean; sig: boolean; secret: boolean } {
  const sig = retellSigned(raw, request.headers.get("x-retell-signature")).ok;
  const secret = sameSecret(presentedSecret(door, request), env.RETELL_FN_SECRET);
  const signedOnly = signatureOnly();
  const ok = sig || (!signedOnly && secret);
  if (ok || signedOnly) logger().info("voice_door_auth", { door, sig, secret, signed_only: signedOnly, ok });
  return { ok, sig, secret };
}
