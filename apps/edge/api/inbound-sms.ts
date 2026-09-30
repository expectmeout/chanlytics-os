/**
 * Chanlytics Messaging — a text arrives on a workspace's line (Twilio's inbound webhook: the lines saga sets it as the
 * InboundRequestUrl of the line's Messaging Service, smsInboundUrl).
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
||||||| base
 * THIS FILE IS THE WIRE, NOT THE JUDGEMENT. What to do with the text is
 * decided by planSmsIngress (lib/sms-ingress.ts), which runs over a database
 * in memory in a test; what is left here is reading the form, logging, the
 * alert's own suppression, and the shape Twilio wants back. The same split
 * the health route and the OAuth callback already use.
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
import { text } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { smsInboundFrom, smsAsWaMessage } from "../lib/packages/channels.js";
import { smsSenderFor } from "../lib/sms/sms.js";
import { planSmsIngress, carrierFor, smsAfterThrow } from "../lib/sms/sms-ingress.js";
import { handleInbound } from "../lib/whatsapp/inbound.js";
import { alertUnroutable } from "../lib/whatsapp/alerts.js";
import { IngestFailed } from "../lib/whatsapp/persist.js";
import { logger, door } from "../lib/log.js";
import { phoneTail } from "../lib/packages/contracts.js";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const twiml = (status: number) => text(status, EMPTY_TWIML, { "content-type": "text/xml" });

export const POST = door(async function POST(request: Request): Promise<Response> {
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
});
