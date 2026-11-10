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
 *   answerArrival       the job's half (../intake/answer-job.ts dispatches to each wire's): the message its door recorded, taken
 *                       through the whole phase: answered while it is unprocessed and no reply names it,
 *                       so a runner killed mid-turn leaves a job the ledger claims again, and nothing is said twice.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundMessage } from "@chanlytics/channels/inbound";
import type { IngestResult, RoutedChannel } from "@chanlytics/db/channels";
import type { Database, Json } from "@chanlytics/db/types";
import { answerInbound, recordInbound, type InboundCarrier } from "@chanlytics/core";
import { markSpoke, scheduleJobOnce, type ClaimedJob } from "@chanlytics/jobs";
import { errField, logger } from "../shared/log.js";
import type { JobPayload } from "@chanlytics/contracts";
import { corePorts, realPorts, type InboundPorts } from "./ports.js";

/**
 * A customer's message as its door hands it over: in the one shape, with its own wire's carrier.
 */
type Arrival =
  | { inbound: InboundMessage & { channel: "whatsapp" }; carrier: null }
  | { inbound: InboundMessage & { channel: "sms" }; carrier: InboundCarrier<"sms"> }
  | { inbound: InboundMessage & { channel: "instagram" }; carrier: InboundCarrier<"instagram"> };

/**
 * The door's half: the message recorded, or set aside, and nothing answered. The ingest's row when it waits for its
 * answer; null when it was set aside, is a redelivery, or there is nowhere to record it. Throws IngestFailed when the
 * write failed, which the door answers with a 503 so the provider sends it again.
 */
export function recordArrival(
  arrival: Arrival,
  routed: RoutedChannel,
  /** Everything outside the verb: the real modules unless a test says otherwise (./ports.ts). */
  ports: InboundPorts = realPorts(),
): Promise<IngestResult | null> {
  return recordInbound({ ...arrival, tenantId: routed.tenantId, routed }, corePorts(ports));
}

/**
 * The job's half: the message its door recorded, taken up again. Its ingest is a redelivery by construction, and core
 * answers it while it is unprocessed and no reply names it (core answerInbound). The job hands in its own
 * ports or carrier, whose sender marks the job as having spoken before the provider is called (../intake/answer-job.ts).
 */
export function answerArrival(
  arrival: Arrival,
  routed: RoutedChannel,
  ports: InboundPorts = realPorts(),
  /** When the turn must have its answer by (the job's deadline, ms since the epoch): core caps it at TURN_BUDGET_MS. */
  endsAtMs?: number,
): Promise<void> {
  return answerInbound(
    { ...arrival, tenantId: routed.tenantId, routed, ...(endsAtMs === undefined ? {} : { endsAtMs }) },
    corePorts(ports),
  );
}

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
  arrival: Arrival,
  routed: RoutedChannel,
  wire: Record<string, Json>,
  ports: InboundPorts = realPorts(),
): Promise<IngestResult | null> {
  const ing = await recordArrival(arrival, routed, ports);
  if (!ing) return null;
  const payload: JobPayload<"inbound_answer"> = {
    ...wire,
    // The wire its job answers on, said rather than read from what the payload carries (../intake/answer-job.ts jobWireOf).
    wire: arrival.inbound.channel,
    message_id: ing.message_id,
    conversation_id: ing.conversation_id,
    contact_id: ing.contact_id,
  };
  try {
    await scheduleJobOnce(db, { tenantId: routed.tenantId, kind: "inbound_answer", dueAt: new Date(), payload });
  } catch (e) {
    // Each wire's door says it in its own name, as it always has: the names are the contract (lib/shared/log.ts).
    const log = logger({ tenant_id: routed.tenantId });
    const fields = { id: arrival.inbound.externalId, error: errField(e) };
    if (arrival.inbound.channel === "whatsapp") log.warn("wa_answer_unscheduled", fields);
    else if (arrival.inbound.channel === "sms") log.warn("sms_answer_unscheduled", fields);
    else log.warn("ig_answer_unscheduled", fields);
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
