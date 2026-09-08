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
 * Twilio wants TwiML or an empty 200 back; an empty <Response/> means "no
 * reply from here" — the reply, when there is one, goes out through the
 * Messaging Service like every other text.
 */
import { text } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { resolveChannelDetailed } from "../lib/workspace/db.js";
import { smsInboundFrom, smsAsWaMessage, smsBody, verifyTwilioSignature, SMS_HELD_REASON, SMS_HELD_DETAILS } from "../lib/workspace/channels.js";
import { lineByNumber, lineAccount, smsSenderFor } from "../lib/sms.js";
import { handleInbound, type InboundCarrier } from "../lib/whatsapp/inbound.js";
import { logger } from "../lib/log.js";

export const config = { maxDuration: 60 };

const EMPTY_TWIML = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>";
const twiml = (status: number) => text(status, EMPTY_TWIML, { "content-type": "text/xml" });

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const form: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) form[k] = v;
  const inbound = smsInboundFrom(form);
  if (!inbound) return twiml(400);
  const L = logger({ sid: inbound.messageSid, from: inbound.from, to: inbound.to });

  const db = pg();
  if (!db) return twiml(503);
  const line = await lineByNumber(db, inbound.to);
  if (!line) {
    L.warn("sms_unknown_line");
    return twiml(404);
  }
  const acct = await lineAccount(db, line);
  if (!acct) {
    L.error("sms_line_without_account");
    return twiml(503);
  }
  // The dry provider signs nothing, and never exists in production.
  if (line.provider !== "dry") {
    const ok = await verifyTwilioSignature(acct.token, request.url, form, request.headers.get("x-twilio-signature"));
    if (!ok) {
      L.warn("sms_bad_signature");
      return twiml(403);
    }
  }

  const { channel: routed, lookupFailed } = await resolveChannelDetailed(db, "sms", inbound.to);
  if (!routed) {
    L.error(lookupFailed ? "sms_routing_lookup_failed" : "sms_unroutable");
    return twiml(200);
  }
  const held = line.sms_state !== "active";
  const sender = held ? null : smsSenderFor(line, acct);
  const carrier: InboundCarrier = {
    channel: "sms",
    send: async (to, body) => {
      if (!sender) return { ok: false, wamid: null, status: 503 };
      return sender.send(to.startsWith("+") ? to : `+${to}`, body);
    },
    body: (text, isFirstReply) => smsBody(text, isFirstReply),
    held: held ? { reason: SMS_HELD_REASON, details: SMS_HELD_DETAILS } : null,
  };
  L.info("sms_inbound", { held, opt: inbound.optOutType, media: inbound.numMedia });
  try {
    await handleInbound(smsAsWaMessage(inbound), {}, routed.tenantId, routed, false, false, carrier);
  } catch (e) {
    L.error("sms_inbound_failed", { error: e instanceof Error ? e.message : String(e) });
  }
  return twiml(200);
}
