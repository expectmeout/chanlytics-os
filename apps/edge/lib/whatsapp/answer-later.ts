/**
 * A WhatsApp message answered after its acknowledgement (decision 0031, Phase 3), the way a text has been since 00347.
 *
 * The webhook answers each message inside Meta's request. The model's turn can take forty of the function's sixty
 * seconds; a function killed mid-turn leaves a message nobody answered, its redelivery stops at the replay gate (on
 * purpose: a second answer is worse than a missed one), and only the deadman sweep finds it, minutes later, for a
 * person. A text's door records the text, schedules its answer as a job and acknowledges at once; this is the same
 * road for WhatsApp: the same job kind (inbound_answer, once per message, in the reply lane), the same ledger rules
 * (tried again until it speaks, never after: jobs markSpoke), and the same net under it (the sweep leaves a message
 * alone while its job is in hand, and takes it once the job has failed for good).
 *
 * ONLY FOR THE WORKSPACES THE EDGE NAMES (WHATSAPP_ANSWERS_AS_JOBS: workspace ids, or `all`). The webhook's contract
 * was frozen for Meta's App Review as process-then-200 (webhook.ts), so the default does not move: with the variable
 * unset every message is answered in the door, as before. Naming one workspace is how the road is tried on real
 * traffic, and unsetting it puts that workspace back at the next message.
 *
 * The job carries the message as Meta sent it and the two facts of its envelope the normaliser reads (the number it
 * was written to and the sender's profile), and names the message, its thread and its person, so an erasure cancels a
 * job still waiting and scrubs one finished (erase_contact, scrubErasedJobs).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WaChangeValue, WaRawMessage } from "../packages/channels.js";
import { resolveChannelDetailed, type Database, type Json, type RoutedChannel } from "../packages/db.js";
import { markSpoke, scheduleJobOnce, type ClaimedJob } from "../packages/jobs.js";
import { phoneTail } from "../packages/contracts.js";
import { env } from "../env.js";
import { errField, logger } from "../log.js";
import { answerText } from "../sms/inbound-text.js";
import { pg } from "../pg.js";
import { handleInbound, recordWhatsappInbound, resumeWhatsappInbound } from "./inbound.js";
import { realPorts, type InboundPorts } from "./ports.js";

type Db = SupabaseClient<Database>;

/** Whether this workspace's WhatsApp messages are answered by a job: named in WHATSAPP_ANSWERS_AS_JOBS, or all are. */
export function answersLater(tenantId: string | null): boolean {
  if (!tenantId) return false;
  const named = (env.WHATSAPP_ANSWERS_AS_JOBS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return named.includes("all") || named.includes(tenantId.toLowerCase());
}

/** What of the change's envelope the normaliser reads: which number, and what the sender calls themselves. */
const envelopeOf = (value: WaChangeValue): WaChangeValue => ({
  ...(value.metadata ? { metadata: value.metadata } : {}),
  ...(value.contacts ? { contacts: value.contacts } : {}),
});

/** A value as the ledger keeps it: what JSON carries of it, which is all a job's payload holds. */
const asKept = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;

/**
 * A message as the webhook takes it: answered here, in Meta's request, unless the edge names its workspace for the
 * other road, where it is recorded, its answer scheduled and the door left to acknowledge.
 */
export function answerHereOrLater(
  m: WaRawMessage,
  value: WaChangeValue,
  tenantId: string | null,
  routed: RoutedChannel | null,
  isEnvDefault: boolean,
): Promise<void> {
  const db = pg();
  return db && routed && answersLater(tenantId)
    ? recordThenAnswerLater(db, m, value, routed, isEnvDefault)
    : handleInbound(m, value, tenantId, routed, isEnvDefault);
}

/**
 * The door's half: the message recorded (or set aside, or a redelivery, and then nothing more), and its answer
 * scheduled as its job, due now. Throws IngestFailed when the write failed, which the webhook answers with a 503 so
 * Meta sends it again. A schedule that fails may be a write that landed and an answer that did not come back, so
 * nothing is answered here: a job that exists answers it, and the sweep hands a message with none to a person.
 */
async function recordThenAnswerLater(
  db: Db,
  m: WaRawMessage,
  value: WaChangeValue,
  routed: RoutedChannel,
  isEnvDefault: boolean,
): Promise<void> {
  const ing = await recordWhatsappInbound(m, value, routed, isEnvDefault);
  if (!ing) return;
  const payload: Json = {
    wa: asKept({ message: m, value: envelopeOf(value) }),
    message_id: ing.message_id,
    conversation_id: ing.conversation_id,
    contact_id: ing.contact_id,
  };
  try {
    await scheduleJobOnce(db, { tenantId: routed.tenantId, kind: "inbound_answer", dueAt: new Date(), payload });
  } catch (e) {
    logger({ tenant_id: routed.tenantId }).warn("wa_answer_unscheduled", { id: m.id, error: errField(e) });
  }
}

/**
 * The door's ports for a job: the WhatsApp sender says it is about to speak on the job's row before Meta is called
 * (jobs markSpoke), so a run killed with the reply in flight, or one that throws after it left, is never run again to
 * write to the person twice. A mark that cannot be written throws at the wire, nothing is sent, and the send door
 * answers as it does for any wire it could not use: the thread is flagged for a person and the owner told.
 */
function speakingOnce(db: Db, job: ClaimedJob, ports: InboundPorts): InboundPorts {
  return {
    ...ports,
    sender: (cfg) => {
      const send = ports.sender(cfg);
      return send
        ? async (to, p) => {
            await markSpoke(db, job);
            return send(to, p);
          }
        : send;
    },
  };
}

/**
 * The job's half: the message its door recorded, answered through the whole inbound phase with `resume` (answered
 * while it is unprocessed and no reply names it). The number's routing is read again, and must still be the job's
 * workspace. Throws when the payload names no message, the number is another workspace's now, or a read failed: the
 * ledger tries again until the job has spoken, and after that the sweep hands the message to a person.
 */
export async function answerWhatsapp(db: Db, job: ClaimedJob): Promise<void> {
  const wa = job.payload.wa as { message?: WaRawMessage; value?: WaChangeValue } | null | undefined;
  const m = wa?.message;
  if (!m?.id || !m.from) throw new Error("inbound_answer: the payload names no WhatsApp message");
  const value = wa?.value ?? {};
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) throw new Error("inbound_answer: the payload does not say which number was written to");
  const { channel: routed } = await resolveChannelDetailed(db, "whatsapp", phoneNumberId);
  if (!routed) throw new Error("inbound_answer: the number's WhatsApp channel could not be read, or is not active");
  if (routed.tenantId !== job.tenant_id)
    throw new Error("inbound_answer: the number written to is another workspace's now");
  logger({ tenant_id: job.tenant_id }).info("wa_answer_taken_up", { id: m.id, from_tail: phoneTail(m.from) });
  const isEnvDefault = phoneNumberId === (env.WHATSAPP_PHONE_ID || "");
  await resumeWhatsappInbound(m, value, routed, isEnvDefault, speakingOnce(db, job, realPorts()));
}

/** An answer job, by what its door recorded: a WhatsApp message (`wa`), or a text (lib/sms/inbound-text.ts). */
export function answerInboundJob(db: Db, job: ClaimedJob): Promise<void> {
  return job.payload.wa ? answerWhatsapp(db, job) : answerText(db, job);
}
