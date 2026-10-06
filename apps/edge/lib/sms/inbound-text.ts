/**
 * Chanlytics Messaging — a text arrives on a workspace's line (Twilio's inbound webhook: the lines saga sets it as the
 * InboundRequestUrl of the line's Messaging Service, smsInboundUrl).
 *
 * The door is api/inbound-sms.ts: `door(receiveInboundText)`, which names the request the platform's way (log.ts).
 * Everything a delivery does is here, in the order the door had it: the form is read, the line and the signature judged
 * (planSmsIngress) and the message handed on; the answer is empty TwiML.
 *
 * THIS FILE IS THE WIRE, NOT THE JUDGEMENT. What to do with the text is decided by planSmsIngress
 * (lib/sms/sms-ingress.ts), which runs over a database in memory in a test; what is left here is reading the form,
 * logging, the alert's own suppression, and the shape Twilio wants back. The same split the health route and the OAuth
 * callback already use. The form is read first: a body that is not a message (smsInboundFrom) is a 400 that asks
 * nothing of the database, and no database is a 503.
 *
 * planSmsIngress finds the line by the number texted and its subaccount's token in the vault before anything is
 * trusted, proves X-Twilio-Signature over the exact URL and every field with that token (the dry provider, which never
 * exists in production, signs nothing), and routes on the `sms` channel row the saga wrote. Its verdict is what the
 * door does: a refusal is answered with its own status (403 for a signature that does not hold, 404 for a number no
 * line carries, 503 for a line, token or routing lookup that could not be read, 200 for a channel row that is missing or
 * switched off, which Twilio is told was received so it stops asking), logged at its own level, and told to the
 * platform through alertUnroutable, suppressed for fifteen minutes per number -- once for the whole class when no line
 * carries the number, because that number is whatever the caller wrote, and never for a bad signature, which is what an
 * unsigned probe looks like.
 *
 * An accepted text then takes the same road a WhatsApp message takes: handleInbound (lib/whatsapp/inbound.ts, onto
 * core's answerInbound) with the line as its carrier (carrierFor) -- answered by the same brain under the same Autonomy
 * rules, with the two things a text does differently: the first reply carries SMS_FOOTER, and a line the carriers have
 * not approved yet (sms_state is not 'active') holds every text for a person instead of answering. The carrier's
 * opt-out and the STOP words are read as the person's consent. When the handler throws, only a text the database did
 * not keep (IngestFailed) is refused, with a 503 so the provider redelivers, and the platform is told; anything later
 * already happened after the words were recorded, and is acknowledged.
 *
 * Every answer is an empty TwiML <Response/>: no reply from here; the reply, when there is one, goes out through the
 * Messaging Service like every other text. Lines carry tails, never numbers (sid, from_tail, to_tail), and never the
 * customer's words or a token (sms-door.test.mjs searches the door's whole stdout for them): sms_inbound for an
 * accepted text, sms_inbound_failed when the handler threw, and the verdict's own event for a refusal.
 */
import { text } from "../http.js";
import { pg } from "../pg.js";
import { keepDelivery, signatureHeaders } from "../intake/keep.js";
import { smsInboundFrom, smsAsWaMessage } from "../packages/channels.js";
import { smsSenderFor } from "./sms.js";
import { planSmsIngress, carrierFor, smsAfterThrow } from "./sms-ingress.js";
import { handleInbound } from "../whatsapp/inbound.js";
import { alertUnroutable } from "../whatsapp/alerts.js";
import { IngestFailed } from "../whatsapp/persist.js";
import { logger } from "../log.js";
import { phoneTail } from "../packages/contracts.js";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

const twiml = (status: number) => text(status, EMPTY_TWIML, { "content-type": "text/xml" });

export async function receiveInboundText(request: Request): Promise<Response> {
  const raw = await request.text();
  const form: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) form[k] = v;
  const inbound = smsInboundFrom(form);
  if (!inbound) return twiml(400);
  // Tails, never numbers: enough to follow one text through the log, not enough to dial.
  const L = logger({ sid: inbound.messageSid, from_tail: phoneTail(inbound.from), to_tail: phoneTail(inbound.to) });

  const db = pg();
  if (!db) return twiml(503);

  const verdict = await planSmsIngress({
    inbound,
    form,
    url: request.url,
    signature: request.headers.get("x-twilio-signature"),
    db,
  });
  // Kept under Twilio's id once its signature held, before any verdict is acted on (decision 0030, 00334). Twilio never
  // sends a text again, so one refused for a routing that could not be read, or a channel switched off, is the one a
  // fix takes in by replay.
  const proven = verdict.kind === "accept" ? { tenantId: verdict.routed.tenantId } : verdict.proven;
  if (proven)
    await keepDelivery(db, {
      provider: "twilio",
      id: inbound.messageSid,
      door: "/api/inbound-sms",
      url: request.url,
      tenantId: proven.tenantId,
      headers: signatureHeaders(request, ["x-twilio-signature"]),
      body: raw,
    });
  if (verdict.kind === "refuse") {
    if (verdict.level === "error") L.error(verdict.log);
    else L.warn(verdict.log);
    // Suppressed for fifteen minutes inside alertUnroutable. The alert always
    // NAMES the number -- an operator cannot act on "a text arrived for
    // unknown-line" -- but a refusal that happens before the signature can be
    // checked is windowed as one class, because the number in it is whatever
    // the caller wrote. That is why the decision above returns the sentence
    // rather than sending it.
    if (verdict.alert) await alertUnroutable("sms", inbound.to, 1, verdict.alert, verdict.alertKey);
    return twiml(verdict.status);
  }

  const { line, acct, routed, held } = verdict;
  const carrier = carrierFor(inbound, held, held ? null : smsSenderFor(line, acct));
  L.info("sms_inbound", { held, opt: inbound.optOutType, media: inbound.numMedia });
  try {
    await handleInbound(smsAsWaMessage(inbound), {}, routed.tenantId, routed, false, carrier);
  } catch (e) {
    L.error("sms_inbound_failed", { error: e instanceof Error ? e.message : String(e) });
    // Twilio retries nothing on its own: a text the database did not accept is
    // refused so the provider redelivers, and the platform is told now.
    const after = smsAfterThrow(e instanceof IngestFailed);
    if (after.alert) await alertUnroutable("sms", inbound.to, 1, after.alert);
    return twiml(after.status);
  }
  return twiml(200);
}
