/**
 * Decision 0001's ingestMessage: persist first, the thread, the replay gate.
 *
 * A short code and a sender off the pilot allowlist are recorded and not answered. Every other message is
 * persisted before anything can fail, its memory is read back, an address in the customer's own words is
 * kept, and the three ways out every later phase speaks through (wire, send, tell) are bound where the wires
 * are. A redelivery stops at the replay gate. An ingest the database refused throws IngestFailed, which
 * travels up to the webhook and its 503.
 */
import { shortCode, addressInMessage } from "@chanlytics/contracts";
import type { SendPurpose } from "@chanlytics/contracts";
import type { IngestResult, Json } from "@chanlytics/db";
import type { Wire } from "../deliver";
import { IngestFailed } from "./ports";
import type { ThreadState } from "./thread";
import { errField, type InboundContext, type Ingested } from "./context";

// Persist first, or say so. An ingest write that fails is the one loss the
// provider can undo: the customer's words go to the workspace mailbox as a
// copy, and IngestFailed travels up to the webhook, which answers 503 so
// Meta redelivers (the ingest's is_new gate makes that idempotent). Twilio
// retries nothing, so the SMS ingress alerts the platform on the same signal.
async function ingestOrSay(cx: InboundContext): Promise<IngestResult | null> {
  const { ports, db, tenantId, n, channel, from, raw, notifyTarget, L } = cx;
  try {
    return await ports.persist.ingest(db, tenantId, n, channel);
  } catch (e) {
    if (e instanceof IngestFailed) {
      // The copy is best effort: a mailbox that cannot be reached must not mask the loss.
      try {
        await ports.alertStaff(
          from,
          n.body ?? `[${raw.type} message]`,
          "(NOT recorded: the database did not accept the message; the provider will retry)",
          "message not recorded",
          { target: notifyTarget, channel, who: n.profileName ?? null },
        );
      } catch (alertErr) {
        L.error("wa_unrecorded_alert_failed", { error: errField(alertErr) });
      }
    }
    throw e;
  }
}

/**
 * The message recorded and its memory read, with the three ways out bound; nothing when it stops here: a short
 * code, a sender off the pilot allowlist, or a redelivery.
 */
export async function ingestMessage(cx: InboundContext): Promise<Ingested | undefined> {
  const { ports, n, tenantId, isEnvDefault, carrier, from, channel, db, t0, L, rt, notifyTarget } = cx;
  const recordOrSay = () => ingestOrSay(cx);
  // THE PILOT ALLOWLIST, scoped to the number it was made for.
  //
  // It exists so the deployment's OWN WhatsApp number — the pilot line in
  // WHATSAPP_PHONE_ID — answers only the testers while something is being
  // tried. It was applied to every message on every channel, which was
  // harmless while there was one tenant and became a silent muzzle the
  // moment there were more: a business that connected its own number would
  // have its customers persisted, marked processed, and never answered,
  // with one event to show for it. The salon has only escaped it because
  // the one allowlisted number is the only person who has written to them.
  //
  // A tenant that brought its own number, and every text on a line this
  // product bought, is never gated by it.
  // A short code is a sender, never a person. A carrier notice, a two-factor
  // code or a bank alert lands on a business's line like any other text, and
  // nothing can be sent back to one from a ten-digit number — so composing a
  // reply spends a model call to produce a message Twilio will refuse, and the
  // failure then raises "Reply delivery failed" at an owner who never wrote it.
  //
  // Recorded, exactly like any other message, because an owner should be able
  // to see what arrived on their line. Not answered. This gates the REPLY, not
  // the persist, for the same reason the allowlist below does.
  if (shortCode(from)) {
    const ing = await recordOrSay();
    const sink = ports.persist.sink(db, tenantId, ing, rt, channel);
    await sink.unreachableSender();
    await sink.processed();
    return;
  }

  // Compared as DIGITS on both sides. Meta delivers `from` as bare digits, and
  // the natural way to write this env var is the E.164 spelling with its "+" —
  // so a raw string compare matched nothing, including the tester the list was
  // written for: every message on the pilot line was persisted, skipped and
  // never answered, with one event per message to show for it. Exactly the
  // silent muzzle the note above exists to prevent.
  const digits = (s: string) => s.replace(/\D/g, "");
  const allow = ports.env.allowlist.split(",").map(digits).filter(Boolean);
  if (isEnvDefault && allow.length && !allow.includes(digits(from))) {
    // §4 delta (deliberate): allowlist gates the REPLY, not the persist.
    const ing = await recordOrSay();
    const sink = ports.persist.sink(db, tenantId, ing, rt, channel);
    await sink.allowlistSkip();
    await sink.processed();
    return;
  }

  // Persist first (P3/§4): the customer's message is never lost to a later
  // failure. Then the memory, which is the same rows the dashboard reads and
  // writes; a read that cannot be made comes back UNKNOWN and is handed to a
  // person below.
  const ing: IngestResult | null = await recordOrSay();
  // Bound once, and never rebound. The closures below hold this memory and
  // read it after awaits, which is only sound while the binding itself cannot
  // change under them.
  const thread: ThreadState = await ports.persist.thread(db, tenantId, ing);
  const ingestMs = Date.now() - t0;
  // This message's wires: WhatsApp on the tenant's credentials (the
  // environment's pair only for the environment's own number), or the
  // carrier that brought the text in. Bound here, where the credentials
  // are; the door refuses when the wire for this channel is missing.
  const wires: Wire = {
    whatsapp: ports.sender(ports.waCfg(rt, isEnvDefault)),
    ...(carrier ? { sms: (to: string, p: { body: string }) => carrier.send(to, p.body) } : {}),
  };
  const sink = ports.persist.sink(db, tenantId, ing, rt, channel, wires);
  // An address a customer gives in their own words is kept, the way YES OFFERS is read from their words: the message
  // that is an address and nothing else, or a few words with one address that is theirs (contracts addressInMessage).
  // Their words are the typed or tapped ones (kind), never a caption, a location or a card that happens to carry one.
  // Only where none is on file; the sink says nothing when it is taken (Part 0 of the campaigns-on-every-channel spec).
  if (ing && n.kind === "text") {
    const given = addressInMessage(n.body);
    if (given) await sink.noteEmail(given);
  }
  // One door out: the carrier shapes the words for its wire (the footer on
  // the first reply to a person), and the sink's door sends them -- re-reading
  // consent, the pause and the workspace's status the moment before.
  // Whether anything of ours has ever reached this person — which on a text
  // decides the rates/STOP/HELP footer the campaign filing promises on a first
  // reply. Postgres answers it outright, and the history could not: a voice
  // call note is an inbound row whose sender is "system", assembleHistory maps
  // that to an assistant turn, and a customer who phoned and then texted for
  // the first time had their first reply sent without the disclosure.
  const repliedBefore = thread.repliedBefore ?? thread.history.some((h) => h.role === "assistant");
  const firstReply = thread.replies.length === 0 && !repliedBefore;
  const wire = (text: string) => (carrier ? carrier.body(text, firstReply) : text);
  const send = (text: string, meta?: Record<string, Json>, purpose?: SendPurpose, kind?: "system") =>
    sink.deliver(from, wire(text), meta, purpose, kind);
  /**
   * The owner's handoff email. Every fact about the conversation other than
   * the words is fixed for this whole invocation, and it was retyped at each
   * of a dozen call sites -- which is how `channel` came to be known here and
   * stated at none of them, and how four of the reasons reached the subject
   * line as raw internal tokens.
   *
   * `pausedHours` is the honest one: only a branch that actually takes the
   * receptionist out of the thread passes it, because the email states the
   * pause, and an owner who believes in one that did not happen answers at
   * their leisure and is talked over by the bot's next reply.
   */
  const tell = (userText: string, botText: string, reason: string, pausedHours: number | null = null) =>
    ports.alertStaff(from, userText, botText, reason, {
      target: notifyTarget,
      channel,
      pausedHours,
      route: ing ? `inbox/th-${ing.conversation_id}` : "inbox",
      who: n.profileName ?? null,
      about: ing ? { type: "conversation", id: ing.conversation_id } : null,
    });

  // Atomic concurrent-redelivery gate. ingest_inbound's is_new claim IS the
  // dedupe, and it is stronger than the `seen` array the retired store kept (a
  // unique index two concurrent lambdas cannot both miss).
  // A missed auto-reply beats a double text, so processed-state is deliberately
  // not consulted.
  if (ing && !ing.is_new) {
    L.info("wa_skip_pg_dupe");
    return;
  }
  return { ing, thread, ingestMs, sink, wire, send, tell };
}
