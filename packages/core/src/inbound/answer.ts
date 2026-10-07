/**
 * The message path: one inbound customer message, from the tenant's runtime
 * to a reply, a hold or a handoff. WhatsApp and text both, and the verb the
 * doors' adapters call (apps/edge/lib/whatsapp/inbound.ts).
 *
 * This file is the order, and only the order: each step is a function in a
 * module beside it. The control plane is read first (./context.ts). Then the
 * ingest (./ingest.ts): a short code and a sender off the pilot allowlist are
 * recorded and not answered; every other message is persisted first, its
 * memory (Postgres, the only one there is) is read, an address in its words
 * is kept, and a redelivery stops at the replay gate. Then the gates, in
 * order: the person's own mode, an unknown thread, consent, the carriers'
 * hold and what kind of message it is (./gates.ts); a message the
 * receptionist may not read (./unreadable.ts); its age, a yes to confirm, the
 * thread's pause and the day's cap, the token budget, the billing pause and
 * the mode in force (./reply-gates.ts). Past the gates a photo's bytes are
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
 * (docs/conversation-flow.md §5.1).
 */
// Values first: the header above then rides on an import the declaration build drops, and stays out of index.d.ts.
import { GO, openInbound } from "./context";
import { ingestMessage } from "./ingest";
import { modeInForce, firstGates } from "./gates";
import { seeingOf, unreadableGate, wordsOf, photoOf } from "./unreadable";
import { lateOrConfirmed, heldForThePerson } from "./reply-gates";
import { modelTurn } from "./model-turn";
import { planTheHold, heldOrKept, sendNow } from "./dispatch";
import { claimTheTurn, stillOurs } from "./turn";
// TYPES ONLY: the normalised message is the channels package's shape and this
// verb speaks it. A VALUE from channels would be a provider inside a verb —
// that is a port, not a widening (hygiene.test.mjs).
import type { CarrierConsent, NormalizedInbound, SendResult } from "@chanlytics/channels";
import type { RoutedChannel } from "@chanlytics/db";
import type { InboundPorts } from "./ports";

/**
 * A channel other than WhatsApp riding the same road. It says how a reply
 * goes out, what the words become on its wire (a text's first reply to a
 * person carries the footer), and whether every message is held for a
 * person for now (a line the carriers have not approved for texting).
 * Null = WhatsApp, on the tenant's credentials, as before.
 */
export interface InboundCarrier {
  channel: "sms";
  /** The provider's answer, its own code with it: the door tells the carrier's no on the person's behalf (21610) from a failure of ours. */
  send(to: string, body: string): Promise<SendResult>;
  body(text: string, isFirstReply: boolean): string;
  held: { reason: string; details: string } | null;
  /** What the carrier itself decided about the text: its STOP or START outranks our reading of the words. */
  consent?: CarrierConsent | null;
}

/** One inbound message, as the door's adapter hands it over. */
export interface InboundInput {
  /** withCarrierConsent(normalizeInbound(m, value), carrier?.consent ?? null), done by the adapter. */
  message: NormalizedInbound;
  /**
   * The raw fields this body still reads off the provider's own shape: the
   * message id and the sender for the log envelope and the wire, the raw type
   * for the words an owner reads ("Customer sent a sticker message"), and the
   * provider's timestamp for the staleness check. Everything else is read from
   * the normalised record above.
   */
  raw: { id: string; from: string; type: string; timestamp: string | number | null };
  tenantId: string | null;
  routed: RoutedChannel | null;
  isEnvDefault: boolean;
  carrier: InboundCarrier | null;
}

export async function answerInbound(input: InboundInput, ports: InboundPorts): Promise<void> {
  const cx = await openInbound(input, ports);
  const kept = await ingestMessage(cx);
  if (!kept) return;
  const at = { ...cx, ...kept, ...(await modeInForce(cx, kept.ing)) };
  if ((await firstGates(at)) !== GO) return;
  const seen = seeingOf(at);
  if ((await unreadableGate(at, seen)) !== GO) return;
  const bodyText = wordsOf(at, seen);
  if ((await lateOrConfirmed(at, bodyText)) !== GO) return;
  if ((await heldForThePerson(at, bodyText)) !== GO) return;
  const shown = await photoOf(at, seen);
  if (!shown) return;
  if ((await claimTheTurn(at, shown.photo)) !== GO) return;
  const turn = await modelTurn(at, bodyText, shown.photo);
  if ((await stillOurs(at, turn, shown.photo)) !== GO) return;
  const hold = await planTheHold(at, turn);
  if ((await heldOrKept(at, turn, hold, bodyText)) !== GO) return;
  await sendNow(at, turn, hold, bodyText);
}
