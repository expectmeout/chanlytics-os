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
 * disagree: the badged key (RETELL_WEBHOOK_KEY; unset, nothing verifies) over the raw body, then over the body
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
import { stripKey, verifyRetellSignature } from "../packages/channels.js";
import { emitEvent } from "../packages/db.js";
import { MIN_MS } from "../packages/contracts.js";
import { env } from "../env.js";
import { errField, logger } from "../log.js";
import { json } from "../http.js";
import { pg } from "../pg.js";

/** Retell's signature over a delivery: the badged key, the raw body, then the body as Retell's example re-serialises it. */
export function retellSigned(
  raw: string,
  header: string | null,
): { ok: boolean; raw: boolean; restringified: boolean } {
  const key = env.RETELL_WEBHOOK_KEY;
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

/**
 * The URL a voice door keeps a delivery under (intake/keep.ts): the one it was knocked on, without its query string,
 * where the shared secret rides (`?key=`, channels withKey; a key on an old webhook URL rides there too, unread). That
 * secret opens the voice doors of every workspace, and the ledger keeps what it is given for a week, so it is never
 * given it. A replay is proved by the signature, kept with the headers; one the secret alone let in replays as a 401.
 */
export function keptUrl(request: Request): string {
  return stripKey(request.url) ?? "";
}

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
/**
 * A phone tool's answer to a knock its door turned away, before anything is read or sent: a sentence the agent speaks,
 * since a 401 has no words and the call went silent mid-sentence, and a line in the log, since the 401 in the access log
 * was the only trace of a secret gone stale on a tool (the review of 11 Oct 2026).
 */
export function refusedOutLoud(door: "fn" | "availability", result: string): Response {
  logger().warn("voice_tool_knock_refused", { door });
  return json(200, { result });
}

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

/** The platform's own workspace id, under which provider-wide evidence is kept (as the call webhook keeps its own). */
const PLATFORM_TENANT = "00000000-0000-0000-0000-000000000000";

/** How often one instance keeps a row for the same door, credential and verdict: once a minute is evidence enough. */
const DOOR_EVIDENCE_EVERY_MS = MIN_MS;

/** When this instance last kept each door's evidence, by door, credential and verdict. */
const lastEvidence = new Map<string, number>();

/**
 * The knock voiceDoorAuth judged, KEPT AS A ROW (decision 0092): `webhook.auth` under the platform, as the call webhook
 * keeps its own, with the door named (`door`), what the knock carried (`sig`, `secret`) and the verdict. Each door calls
 * it right after its own voiceDoorAuth, before it answers.
 *
 * The switch that closes the shared secret (RETELL_DOORS_SIGNED) is set on evidence that every door's real deliveries
 * carry Retell's signature. That evidence lived only in Vercel's log, which keeps about a day, so a door nobody knocked
 * that day could never be judged; the call webhook's own evidence was rows from the start. /api/diag (retellAuth.doors)
 * says, for the last seven days, which doors were knocked with what. A row is kept at most once a minute per instance
 * for each door, credential and verdict, so a public URL is no write amplifier, and a refusal is kept only once the
 * signature is required (it may then be Retell's), as the log line is. Awaited, never thrown: a serverless instance is
 * frozen once it answers, and a row the freeze ate is no evidence.
 */
export async function keepKnock(
  door: VoiceDoor,
  knock: { ok: boolean; sig: boolean; secret: boolean },
  o: { now?: number; db?: ReturnType<typeof pg> } = {},
): Promise<void> {
  const signedOnly = signatureOnly();
  if (!knock.ok && !signedOnly) return;
  const now = o.now ?? Date.now();
  const key = `${door}|${knock.sig}|${knock.secret}|${knock.ok}`;
  if (now - (lastEvidence.get(key) ?? 0) < DOOR_EVIDENCE_EVERY_MS) return;
  lastEvidence.set(key, now);
  const db = o.db === undefined ? pg() : o.db;
  if (!db) return;
  try {
    await emitEvent(db, PLATFORM_TENANT, "webhook.auth", null, null, {
      provider: "retell",
      door,
      sig: knock.sig,
      secret: knock.secret,
      signed_only: signedOnly,
      ok: knock.ok,
    });
  } catch (e) {
    logger().error("webhook_auth_event_failed", { door, error: errField(e) });
  }
}

/**
 * The secret provisioning hands Retell with a new agent and number: none once the voice doors open for the signature
 * alone (null: the tools get no header and the inbound URL no `?key=`, so nothing new carries a secret the edge no
 * longer reads), else RETELL_FN_SECRET, undefined when it is not set (the provisioning door then refuses, no_fn_secret).
 */
export function secretToProvision(): string | null | undefined {
  return signatureOnly() ? null : env.RETELL_FN_SECRET || undefined;
}
