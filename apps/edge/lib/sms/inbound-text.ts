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
 * A text that is a one-time code another service sent (planSmsIngress's `code`) takes none of it: nothing is answered, kept,
 * handed to a person or paged, and the line says which service it read and never the code (`sms_code_skipped`). Twilio keeps
 * the text; the owner reads it from there (lib/lines/line-codes.ts), so a code is neither lost nor stored here: not as a
 * message, and not as a kept delivery either (a code's delivery is the one the intake ledger never keeps).
 *
 * An accepted text then takes the same road a WhatsApp message takes, with the line as its carrier (carrierFor) --
 * answered by the same brain under the same Autonomy rules, with the two things a text does differently: the first
 * reply carries SMS_FOOTER, and a line the carriers have not approved yet (sms_state is not 'active') holds every text
 * for a person instead of answering. The carrier's opt-out and the STOP words are read as the person's consent.
 *
 * It is answered after the acknowledgement (decision 0031, Phase 2): Twilio waits fifteen seconds for this answer, and a
 * model's turn can take longer. The door records the text (recordInboundMessage, core recordInbound: set aside, or
 * kept, nothing decided) and schedules its answer as a job (inbound_answer, once per message, in the reply lane), then
 * answers Twilio. The job (answerText) reads the line and its routing again and takes the text up again through the
 * whole phase (handleInbound with `resume`), so a runner killed mid-turn leaves a job the ledger claims again, which
 * answers while the message is unprocessed and no reply names it, and never texts twice. A job that could not be
 * scheduled (a database before 00347 refuses the kind) is said (sms_answer_unscheduled) and the text is answered here,
 * as before. When recording throws, only a text the database did not keep (IngestFailed) is refused, with a 503 so the
 * provider redelivers, and the platform is told; anything later already happened after the words were recorded, and
 * is acknowledged.
 *
 * Every answer is an empty TwiML <Response/>: no reply from here; the reply, when there is one, goes out through the
 * Messaging Service like every other text. Lines carry tails, never numbers (sid, from_tail, to_tail), and never the
 * customer's words or a token (sms-door.test.mjs searches the door's whole stdout for them): sms_inbound for an
 * accepted text, sms_inbound_failed when the handler threw, and the verdict's own event for a refusal.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { text } from "../http.js";
import { pg } from "../pg.js";
import { keepDelivery, signatureHeaders } from "../intake/keep.js";
import { oneTimeCodeOf, smsInboundFrom, smsAsWaMessage, type SmsInbound } from "../packages/channels.js";
import type { Database, IngestResult, Json } from "../packages/db.js";
import { scheduleJobOnce, type ClaimedJob } from "../packages/jobs.js";
import { smsSenderFor } from "./sms.js";
import { planSmsIngress, carrierFor, smsAfterThrow, lineForAnswer } from "./sms-ingress.js";
import { handleInbound, recordInboundMessage } from "../whatsapp/inbound.js";
import { alertUnroutable } from "../whatsapp/alerts.js";
import { IngestFailed } from "../whatsapp/persist.js";
import { errField, logger } from "../log.js";
import { phoneTail } from "../packages/contracts.js";

type Db = SupabaseClient<Database>;

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
  // Kept under Twilio's id once its signature held, before any verdict is acted on (decision 0032, 00336). Twilio never
  // sends a text again, so one refused for a routing that could not be read, or a channel switched off, is the one a
  // fix takes in by replay. A one-time code another service texted to the line is never kept, whatever its verdict: a
  // replay of it would answer nothing, and Twilio already keeps it for the owner (lib/lines/line-codes.ts), so a code is
  // a secret that is not ours to hold for a week.
  const proven = oneTimeCodeOf(inbound.body)
    ? null
    : verdict.kind === "accept"
      ? { tenantId: verdict.routed.tenantId }
      : verdict.kind === "refuse"
        ? verdict.proven
        : null;
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

  if (verdict.kind === "code") {
    L.info("sms_code_skipped", { service: verdict.from });
    return twiml(200);
  }

  const { line, acct, routed, held } = verdict;
  const carrier = carrierFor(inbound, held, held ? null : smsSenderFor(line, acct));
  L.info("sms_inbound", { held, opt: inbound.optOutType, media: inbound.numMedia });
  const receivedAt = Date.now();
  const message = smsAsWaMessage(inbound, receivedAt);
  try {
    // Recorded, then answered by its job; answered here only when the job could not be written.
    const ing = await recordInboundMessage(message, routed.tenantId, routed, carrier);
    if (ing && !(await answerLater(db, routed.tenantId, answerPayload(form, receivedAt, ing), L)))
      await handleInbound(message, {}, routed.tenantId, routed, false, carrier, undefined, true);
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

/** The fields smsInboundFrom reads, picked from Twilio's form: what a text's job carries of it, and nothing else. */
const TEXT_FIELDS =
  /^(MessageSid|SmsSid|From|To|Body|NumMedia|MediaContentType\d+|OptOutType|MessagingServiceSid|AccountSid)$/;

/** The text's own fields, as Twilio named them, for its job: the one parser reads them again there. */
function textFields(form: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(form).filter(([k]) => TEXT_FIELDS.test(k)));
}

/**
 * What a text's job carries: the text, when it came (the staleness check reads it), and the rows it was kept as. The
 * message, its thread and its person are named so an erasure cancels a job still waiting and scrubs one finished
 * (erase_contact, scrubErasedJobs).
 */
function answerPayload(form: Record<string, string>, receivedAt: number, ing: IngestResult): Json {
  return {
    text: textFields(form),
    received_at: receivedAt,
    message_id: ing.message_id,
    conversation_id: ing.conversation_id,
    contact_id: ing.contact_id,
  };
}

/**
 * The text's answer scheduled as its job, once per message, due now. False when it could not be written: a database
 * before 00347 refuses the kind, and the door then answers the text itself.
 */
async function answerLater(db: Db, tenantId: string, payload: Json, L: ReturnType<typeof logger>): Promise<boolean> {
  try {
    await scheduleJobOnce(db, { tenantId, kind: "inbound_answer", dueAt: new Date(), payload });
    return true;
  } catch (e) {
    L.warn("sms_answer_unscheduled", { error: errField(e) });
    return false;
  }
}

/**
 * The job's half (inbound_answer, bound by lib/ops/jobs-tick.ts): the text its door recorded, answered. The line and
 * its routing are read again (lineForAnswer), the text is the one Twilio sent, with the time it came for the staleness
 * check, and the whole inbound phase runs with `resume`: answered while the message is unprocessed and no reply names
 * it. Throws when the payload names no text, the number is another workspace's now, or a read failed: the ledger tries
 * again, and after that the deadman sweep hands the message to a person.
 */
export async function answerText(db: Db, job: ClaimedJob): Promise<void> {
  const fields = job.payload.text;
  const inbound: SmsInbound | null =
    fields !== null && typeof fields === "object" ? smsInboundFrom(fields as Record<string, string>) : null;
  if (!inbound) throw new Error("inbound_answer: the payload names no text");
  const receivedAt = typeof job.payload.received_at === "number" ? job.payload.received_at : Date.now();
  const { line, acct, routed, held } = await lineForAnswer(db, inbound);
  if (routed.tenantId !== job.tenant_id)
    throw new Error("inbound_answer: the number texted is another workspace's now");
  const carrier = carrierFor(inbound, held, held ? null : smsSenderFor(line, acct));
  const L = logger({ tenant_id: job.tenant_id, sid: inbound.messageSid, to_tail: phoneTail(inbound.to) });
  L.info("sms_answer_taken_up", { held });
  await handleInbound(
    smsAsWaMessage(inbound, receivedAt),
    {},
    routed.tenantId,
    routed,
    false,
    carrier,
    undefined,
    true,
  );
}
