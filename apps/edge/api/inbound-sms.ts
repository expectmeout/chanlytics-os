/**
 * Chanlytics Messaging — a text arrives on a workspace's line (Twilio's
 * inbound webhook, set on the line's Messaging Service by the saga).
 *
 * The request is proven first: X-Twilio-Signature over the exact URL and
 * every field, with the token of the subaccount the line lives in, read
 * from the vault. Then the same road a WhatsApp message takes — the text
 * becomes the handler's message, routed on the `sms` channel row the saga
 * wrote, answered by the same brain under the same Autonomy rules — with
 * the two things a text does differently: the first reply carries the
 * footer, and a line the carriers have not approved yet holds every text
 * for a person instead of answering.
 *
 * THIS FILE IS THE WIRE, NOT THE JUDGEMENT. What to do with the text is
 * decided by planSmsIngress (lib/sms-ingress.ts), which runs over a database
 * in memory in a test; what is left here is reading the form, logging, the
 * alert's own suppression, and the shape Twilio wants back. The same split
 * the health route and the OAuth callback already use.
 *
 * Twilio wants TwiML or an empty 200 back; an empty <Response/> means "no
 * reply from here" — the reply, when there is one, goes out through the
 * Messaging Service like every other text.
 */
import { text } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { smsInboundFrom, smsAsWaMessage } from "../lib/workspace/channels.js";
import { smsSenderFor } from "../lib/sms.js";
import { planSmsIngress, carrierFor, smsAfterThrow } from "../lib/sms-ingress.js";
import { handleInbound } from "../lib/whatsapp/inbound.js";
import { alertUnroutable } from "../lib/whatsapp/alerts.js";
import { IngestFailed } from "../lib/whatsapp/persist.js";
import { logger } from "../lib/log.js";
import { phoneTail } from "../lib/workspace/contracts.js";

export const config = { maxDuration: 60 };

const EMPTY_TWIML = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>";
const twiml = (status: number) => text(status, EMPTY_TWIML, { "content-type": "text/xml" });

export async function POST(request: Request): Promise<Response> {
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
    // Suppressed for fifteen minutes inside alertUnroutable, by the key the
    // verdict names -- the number for a refusal about a line we know, a
    // constant for one that could not be authenticated at all. That is why the
    // decision above returns the sentence rather than sending it.
    if (verdict.alert) await alertUnroutable("sms", verdict.alertKey ?? inbound.to, 1, verdict.alert);
    return twiml(verdict.status);
  }

  const { line, acct, routed, held } = verdict;
  const carrier = carrierFor(inbound, held, held ? null : smsSenderFor(line, acct));
  L.info("sms_inbound", { held, opt: inbound.optOutType, media: inbound.numMedia });
  try {
    await handleInbound(smsAsWaMessage(inbound), {}, routed.tenantId, routed, false, false, carrier);
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
