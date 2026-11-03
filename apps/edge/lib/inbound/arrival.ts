/**
 * The doors' adapter onto the receptionist: a customer's message on any wire, recorded at its door and answered by its
 * job (decision 0031: a WhatsApp message since 3 Nov 2026, as a text has been since 00347 and an Instagram DM since
 * step 8 of decision 0001).
 *
 * The message path itself -- persist, the memory, the gates in order, the brain, layer two, the hold window -- is
 * answerInbound in packages/core/src/inbound/answer.ts, a verb over ports. This file is what the edge brings to it: the
 * real modules behind ./ports.ts, and the two halves every door takes.
 *
 * Each door makes its message into the one inbound shape with its own wire's adapter (decision 0001, step 3), and hands
 * it over as an arrival with its wire's carrier: none for WhatsApp, which sends on the workspace's credentials, the
 * line's for a text, the account's for a DM.
 *
 *   recordThenSchedule  the door's half: the message recorded (core recordInbound: set aside, or kept, nothing decided),
 *                       and its answer scheduled as an inbound_answer job, once per message, in the reply lane. Meta and
 *                       Twilio are answered as soon as the message is on record, and a model's turn never runs inside
 *                       their request.
 *   answerArrival       the job's half (./answer-job.ts dispatches to each wire's): the message its door recorded, taken
 *                       through the whole phase: answered while it is unprocessed and no reply names it,
 *                       so a runner killed mid-turn leaves a job the ledger claims again, and nothing is said twice.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundMessage } from "../packages/channels.js";
import type { Database, IngestResult, Json, RoutedChannel } from "../packages/db.js";
import { answerInbound, recordInbound, type InboundCarrier } from "../packages/core.js";
import { markSpoke, scheduleJobOnce, type ClaimedJob } from "../packages/jobs.js";
import { errField, logger, type LogEvent } from "../log.js";
import { corePorts, realPorts, type InboundPorts } from "./ports.js";

/**
 * A customer's message as its door hands it over: in the one shape, with its own wire's carrier. `isEnvDefault` is
 * WhatsApp's alone: the environment's own pilot number, whose replies leave on the environment's credentials.
 */
export type Arrival =
  | { inbound: InboundMessage & { channel: "whatsapp" }; carrier: null; isEnvDefault: boolean }
  | { inbound: InboundMessage & { channel: "sms" }; carrier: InboundCarrier<"sms"> }
  | { inbound: InboundMessage & { channel: "instagram" }; carrier: InboundCarrier<"instagram"> };

const envDefaultOf = (a: Arrival): boolean => (a.carrier === null ? a.isEnvDefault : false);

/**
 * The door's half: the message recorded, or set aside, and nothing answered. The ingest's row when it waits for its
 * answer; null when it was set aside, is a redelivery, or there is nowhere to record it. Throws IngestFailed when the
 * write failed, which the door answers with a 503 so the provider sends it again.
 */
export function recordArrival(
  a: Arrival,
  routed: RoutedChannel,
  /** Everything outside the verb: the real modules unless a test says otherwise (./ports.ts). */
  ports: InboundPorts = realPorts(),
): Promise<IngestResult | null> {
  const isEnvDefault = envDefaultOf(a);
  return recordInbound({ ...a, tenantId: routed.tenantId, routed, isEnvDefault }, corePorts(ports));
}

/**
 * The job's half: the message its door recorded, taken up again. Its ingest is a redelivery by construction, and core
 * answers it while it is unprocessed and no reply names it (core answerInbound). The job hands in its own
 * ports or carrier, whose sender marks the job as having spoken before the provider is called (./answer-job.ts).
 */
export function answerArrival(a: Arrival, routed: RoutedChannel, ports: InboundPorts = realPorts()): Promise<void> {
  const isEnvDefault = envDefaultOf(a);
  return answerInbound({ ...a, tenantId: routed.tenantId, routed, isEnvDefault }, corePorts(ports));
}

/** What each wire's door says when its message's job could not be written: the names are the contract (lib/log.ts). */
const UNSCHEDULED: Record<Arrival["inbound"]["channel"], LogEvent> = {
  whatsapp: "wa_answer_unscheduled",
  sms: "sms_answer_unscheduled",
  instagram: "ig_answer_unscheduled",
};

/**
 * The door's whole half: the message recorded, and its answer scheduled as its job, due now (its row wakes the ledger,
 * decision 0033). `wire` is what that wire's job reads the message from again (Meta's message and its envelope, Twilio's
 * form, the DM's item): the job's payload keeps it beside the rows the message was kept as, which are named so an
 * erasure cancels a job still waiting and scrubs one finished (erase_contact, scrubErasedJobs).
 *
 * A schedule that fails may be a write that landed and an answer that did not come back (a timeout), so nothing is
 * answered here either way: a job that exists answers the message, and the deadman sweep hands one with none to a person.
 * A missed auto-reply beats a double text. Answers the ingest's row, as recordArrival does.
 */
export async function recordThenSchedule(
  db: SupabaseClient<Database>,
  a: Arrival,
  routed: RoutedChannel,
  wire: Record<string, Json>,
  ports: InboundPorts = realPorts(),
): Promise<IngestResult | null> {
  const ing = await recordArrival(a, routed, ports);
  if (!ing) return null;
  const payload: Json = {
    ...wire,
    message_id: ing.message_id,
    conversation_id: ing.conversation_id,
    contact_id: ing.contact_id,
  };
  try {
    await scheduleJobOnce(db, { tenantId: routed.tenantId, kind: "inbound_answer", dueAt: new Date(), payload });
  } catch (e) {
    logger({ tenant_id: routed.tenantId }).warn(UNSCHEDULED[a.inbound.channel], {
      id: a.inbound.externalId,
      error: errField(e),
    });
  }
  return ing;
}

/** A send that first says, on the job's row, that the job is about to speak (jobs markSpoke): the one wrapper every wire's job takes. */
export function spokeFirst<A extends unknown[], R>(
  db: SupabaseClient<Database>,
  job: ClaimedJob,
  send: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args) => {
    await markSpoke(db, job);
    return send(...args);
  };
}
