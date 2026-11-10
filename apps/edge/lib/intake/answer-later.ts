/**
 * A WhatsApp message answered after its acknowledgement (decision 0031, Phase 3), the way a text has been since 00347:
 * every message, since 3 Nov 2026.
 *
 * The webhook used to answer each message inside Meta's request. The model's turn can take forty of the function's sixty
 * seconds, a delivery's messages ran one after another, and a function killed mid-turn left a message nobody answered,
 * whose redelivery stops at the replay gate (on purpose: a second answer is worse than a missed one), for the deadman
 * sweep to find minutes later. Now the door records the message, schedules its answer as a job and acknowledges at once:
 * the same job kind as a text's (inbound_answer, once per message, in the reply lane), the same ledger rules (tried
 * again until it speaks, never after: lib/inbound/arrival.ts spokeFirst), and the same net under it (the sweep leaves
 * a message alone while its job is in hand, and takes it once the job has failed for good). Two messages of one thread
 * in one delivery are two jobs, and the thread's reply turn (00284) lets the newer one answer both.
 *
 * The job carries the message as Meta sent it and the two facts of its envelope the normaliser reads (the number it
 * was written to and the sender's profile). The door and the job make it into the one inbound shape with the same
 * adapter (inboundFromWhatsapp, decision 0001 step 3), so a job a door wrote before a deploy is read as one written
 * after it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { inboundFromWhatsapp, type WaChangeValue, type WaRawMessage } from "@chanlytics/channels/whatsapp";
import { resolveChannelDetailed, type RoutedChannel } from "@chanlytics/db/channels";
import type { Database } from "@chanlytics/db/types";
import type { ClaimedJob } from "@chanlytics/jobs";
import { phoneTail } from "@chanlytics/contracts";
import { env } from "../shared/env.js";
import { logger } from "../shared/log.js";
import { answerArrival, recordThenSchedule, spokeFirst } from "../inbound/arrival.js";
import { realPorts, type InboundPorts } from "../inbound/ports.js";
import { jsonCopyOf } from "@chanlytics/db/shared";

type Db = SupabaseClient<Database>;

/** What of the change's envelope the normaliser reads: which number, and what the sender calls themselves. */
const envelopeOf = (value: WaChangeValue): WaChangeValue => ({
  ...(value.metadata ? { metadata: value.metadata } : {}),
  ...(value.contacts ? { contacts: value.contacts } : {}),
});

/** A value as the ledger keeps it: what JSON carries of it, which is all a job's payload holds. */
const asKept = jsonCopyOf;

/** Whether this number is the environment's own pilot line, whose replies leave on the environment's credentials. */
const isEnvNumber = (phoneNumberId: string | undefined): boolean =>
  !!phoneNumberId && phoneNumberId === (env.WHATSAPP_PHONE_ID || "");

/**
 * The door's half: the message recorded (or set aside, or a redelivery, and then nothing more), and its answer scheduled
 * as its job, due now. Throws IngestFailed when the write failed, which the webhook answers with a 503 so Meta sends it
 * again.
 */
export async function recordWhatsapp(
  db: Db,
  waRawMessage: WaRawMessage,
  value: WaChangeValue,
  routed: RoutedChannel,
): Promise<void> {
  const isEnvDefault = isEnvNumber(value.metadata?.phone_number_id);
  await recordThenSchedule(
    db,
    { inbound: inboundFromWhatsapp(waRawMessage, value), carrier: null, isEnvDefault },
    routed,
    {
      wa: asKept({ message: waRawMessage, value: envelopeOf(value) }),
    },
  );
}

/**
 * The door's ports for a job: the WhatsApp sender says it is about to speak on the job's row before Meta is called
 * (spokeFirst), so a run killed with the reply in flight, or one that throws after it left, is never run again.
 */
function speakingOnce(db: Db, job: ClaimedJob, ports: InboundPorts): InboundPorts {
  return {
    ...ports,
    sender: (cfg) => {
      const send = ports.sender(cfg);
      return send ? spokeFirst(db, job, send) : send;
    },
  };
}

/**
 * The job's half: the message its door recorded, answered through the whole inbound phase with `resume` (answered
 * while it is unprocessed and no reply names it). The number's routing is read again, and must still be the job's
 * workspace. Throws when the payload names no message, the number is another workspace's now, or a read failed: the
 * ledger tries again until the job has spoken, and after that the sweep hands the message to a person.
 */
export async function answerWhatsapp(db: Db, job: ClaimedJob, deadline?: number): Promise<void> {
  const wa = job.payload.wa as { message?: WaRawMessage; value?: WaChangeValue } | null | undefined;
  const message = wa?.message;
  if (!message?.id || !message.from) throw new Error("inbound_answer: the payload names no WhatsApp message");
  const value = wa?.value ?? {};
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) throw new Error("inbound_answer: the payload does not say which number was written to");
  const { channel: routed } = await resolveChannelDetailed(db, "whatsapp", phoneNumberId);
  if (!routed) throw new Error("inbound_answer: the number's WhatsApp channel could not be read, or is not active");
  if (routed.tenantId !== job.tenant_id)
    throw new Error("inbound_answer: the number written to is another workspace's now");
  logger({ tenant_id: job.tenant_id }).info("wa_answer_taken_up", {
    id: message.id,
    from_tail: phoneTail(message.from),
  });
  const arrival = {
    inbound: inboundFromWhatsapp(message, value),
    carrier: null,
    isEnvDefault: isEnvNumber(phoneNumberId),
  };
  await answerArrival(arrival, routed, speakingOnce(db, job, realPorts()), deadline);
}
