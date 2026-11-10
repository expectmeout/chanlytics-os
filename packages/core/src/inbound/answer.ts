/**
 * The message path: one inbound customer message, from the tenant's runtime
 * to a reply, a hold or a handoff. WhatsApp, text and Instagram DMs alike, and the verb the
 * doors' adapter calls (apps/edge/lib/inbound/arrival.ts: recordInbound at the door, answerInbound in the job).
 *
 * This file is the order, and only the order: each step is a function in a
 * module beside it. The control plane is read first (./context.ts). Then the
 * ingest (./ingest.ts): a short code and a one-time code a service sent are
 * recorded and not answered; every other message is persisted first, its
 * memory (Postgres, the only one there is) is read, an address in its words
 * is kept, and a redelivery stops at the replay gate. Then the gates, in
 * order: the person's own mode, an unknown thread, consent, the carriers'
 * hold and what kind of message it is (./gates.ts); its age, before anything
 * automated may be said of it (./reply-gates.ts); a message the receptionist
 * may not read (./unreadable.ts); a yes to confirm, the thread's pause and the
 * day's cap, the billing pause, the live hold a call or a person has on the
 * thread, the token budget and the mode in force (./reply-gates.ts). Past the
 * gates a photo's bytes are
 * fetched (./unreadable.ts), the message claims the thread's reply turn, the
 * brain composes and layer two checks the words (./model-turn.ts, over
 * steps.ts), the turn is asked again (./turn.ts: a newer message of the thread
 * answers both), and the reply goes out now or waits in the hold window
 * (./dispatch.ts). Every branch reports through the sink
 * and tells a person where one is needed, both of them ports (./ports.ts). In
 * the phases' comments, "above" and "below" mean earlier and later in this
 * order.
 *
 * The decisions with no side effects live in steps.ts as truth tables; this
 * file is the order they happen in, and the ORDER IS THE PRODUCT
 * (./order.ts says it once, as data: INBOUND_GATES, which docs/inbound-gates.md is written from and the verb is
 * run against, tests/inbound/the-gates-run-in-their-order.test.mjs).
 */
// Values first: the header above then rides on an import the declaration build drops, and stays out of index.d.ts.
import { GO, openInbound } from "./context";
import { ingestMessage, recordMessage } from "./ingest";
import { readModeInForce, runFirstGates } from "./gates";
import { seeingOf, runUnreadableGate, wordsOf, findPhoto } from "./unreadable";
import { isTooLate, hasConfirmedYes, holdForThePerson } from "./reply-gates";
import { takeModelTurn, showTyping } from "./model-turn";
import { planTheHold, holdOrKeep, sendNow } from "./dispatch";
import { claimTheTurn, isStillOurs } from "./turn";
// TYPES ONLY: the one inbound shape is the channels package's, and this verb speaks it. A VALUE from channels would be a
// provider inside a verb — that is a port, not a widening (hygiene.test.mjs).
import type { InboundMessage } from "@chanlytics/channels/inbound";
import type { SendResult } from "@chanlytics/channels/whatsapp";
import type { IngestResult, RoutedChannel } from "@chanlytics/db/channels";
import type { EscalationReason } from "@chanlytics/contracts";
import type { InboundChannel, InboundPorts } from "./ports";
import type { TenantId } from "@chanlytics/contracts";

/**
 * A channel other than WhatsApp riding the same road: a texting line, or an Instagram account's DMs. It says how a reply
 * goes out, what the words become on its wire (a text's first reply to a person carries the footer; a DM's are as
 * written), and whether every message is held for a person for now (a line the carriers have not approved for texting).
 * Null = WhatsApp, on the tenant's credentials, as before. What the person said about being written to is the message's
 * own (InboundMessage.consent): the carrier's verdict is read into it by the text's adapter.
 */
export interface InboundCarrier<C extends CarriedChannel = CarriedChannel> {
  channel: C;
  /** The provider's answer, its own code with it: the door tells the carrier's no on the person's behalf (21610) from a failure of ours. */
  send(to: string, body: string): Promise<SendResult>;
  body(text: string, isFirstReply: boolean): string;
  held: { reason: EscalationReason; details: string } | null;
}

/** The wires a carrier brings a message in on: every inbound wire but WhatsApp, which rides the tenant's credentials. */
export type CarriedChannel = Exclude<InboundChannel, "whatsapp">;

/**
 * One inbound message, as its door hands it over (decision 0001, step 3): in the one inbound shape (channels
 * InboundMessage), made by its wire's own adapter, with the carrier of that wire: none for WhatsApp, the line's for a
 * text, the account's for a DM (step 8).
 */
export type InboundInput = InboundAt &
  (
    | { inbound: InboundMessage & { channel: "whatsapp" }; carrier: null }
    | { inbound: InboundMessage & { channel: "sms" }; carrier: InboundCarrier<"sms"> }
    | { inbound: InboundMessage & { channel: "instagram" }; carrier: InboundCarrier<"instagram"> }
  );

/** Where a message arrived, and when its turn must have its answer by. */
interface InboundAt {
  tenantId: TenantId;
  routed: RoutedChannel;
  /**
   * The job's deadline (ms since the epoch), when the ledger gives one: the turn is held to it and to TURN_BUDGET_MS from
   * its start, whichever comes first (./context.ts), so a slow model ends in the holding reply and a person, never in a
   * function killed with the customer unanswered.
   */
  endsAtMs?: number;
}

/**
 * The door's half of a message answered after its acknowledgement (decision 0031, on every wire): the message set aside
 * or recorded, nothing decided about the answer. The ingest's row when it waits for its answer, which its job gives it
 * (answerInbound); null when it was set aside, is a redelivery, or there is nowhere to record it; IngestFailed when the
 * write failed, so the door refuses and the provider sends it again.
 */
export async function recordInbound(input: InboundInput, ports: InboundPorts): Promise<IngestResult | null> {
  const cx = await openInbound(input, ports);
  return (await recordMessage(cx)) ?? null;
}

/**
 * The job's half: the message its door recorded, taken up again and answered. Its ingest is a redelivery by
 * construction, and it goes on while the message is unprocessed and no reply names it (./ingest.ts).
 */
export async function answerInbound(input: InboundInput, ports: InboundPorts): Promise<void> {
  const cx = await openInbound(input, ports);
  const kept = await ingestMessage(cx);
  if (!kept) return;
  const at = { ...cx, ...kept, ...(await readModeInForce(cx, kept.ing)) };
  if ((await runFirstGates(at)) !== GO) return;
  if ((await isTooLate(at)) !== GO) return;
  const seen = seeingOf(at);
  if ((await runUnreadableGate(at, seen)) !== GO) return;
  const bodyText = wordsOf(at, seen);
  if ((await hasConfirmedYes(at, bodyText)) !== GO) return;
  if ((await holdForThePerson(at, bodyText)) !== GO) return;
  const shown = await findPhoto(at, seen);
  if (!shown) return;
  if ((await claimTheTurn(at, shown.photo)) !== GO) return;
  showTyping(at);
  const turn = await takeModelTurn(at, bodyText, shown.photo);
  if ((await isStillOurs(at, turn, shown.photo)) !== GO) return;
  const hold = await planTheHold(at, turn);
  if ((await holdOrKeep(at, turn, hold, bodyText)) !== GO) return;
  await sendNow(at, turn, hold, bodyText);
}
