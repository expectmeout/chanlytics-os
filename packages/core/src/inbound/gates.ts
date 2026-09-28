/**
 * The first gates, in order: the person's own mode, looked up before any branch that can speak; then a thread
 * that could not be read, consent, the carriers' hold, and what kind of message arrived. A gate that stops the
 * message returns; a message that passes them all returns GO.
 */
import { isOptedOutContact } from "@chanlytics/contracts";
import type { IngestResult } from "@chanlytics/db";
import { effectiveReplyMode } from "./reply-posture";
import { resolveConsent } from "./consent";
import { isThreadUnknown } from "./thread";
import { GO, type Answering, type InboundContext, type ModeInForce } from "./context";

/** The mode in force for this one message: the workspace's posture, or this person's own setting where one is set. */
export async function modeInForce(cx: InboundContext, ing: IngestResult | null): Promise<ModeInForce> {
  const { db, tenantId, ports, posture, L } = cx;
  // Reassigned once THIS person's own setting is known, just before the
  // policy is consulted below.
  let replyMode = posture.replyMode;
  let personMode: string | null = null;
  // The person's own receptionist mode (People → profile → "Receptionist
  // for …") wins over the workspace policy. Looked up per message and never
  // cached: "Never" for a difficult customer must apply to their NEXT message.
  // A failed lookup keeps the workspace mode — a blip must neither silence
  // nor unmute anyone.
  //
  // Looked up HERE, before the first branch that can speak. It used to sit
  // just above the policy consult, below the non-text acknowledgement — so a
  // person set to Never who sent a photo got the canned "I can't read
  // attachments" text from the receptionist that was told to stay out.
  if (db && tenantId && ing?.contact_id) {
    try {
      personMode = await ports.leads.personReplyMode(db, tenantId, ing.contact_id);
      replyMode = effectiveReplyMode(posture, personMode);
    } catch (e) {
      L.warn("wa_person_mode_lookup_failed", { error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { replyMode, personMode };
}

/** A thread that could not be read, consent, the carriers' hold and what kind of message arrived, in that order. */
export async function firstGates(at: Answering): Promise<typeof GO | undefined> {
  const { thread, L, sink, tell, n, raw, ing, carrier } = at;
  // The memory could not be read, and there is no second copy to ask. We do
  // not know whether a human has taken this thread over, what was already
  // said, or how many replies have gone out today — so every gate below would
  // be answering from an invented empty history. Hand to a human instead of
  // guessing; the customer's message is already persisted above.
  if (isThreadUnknown(thread)) {
    L.error("wa_state_unavailable");
    await Promise.all([
      sink.escalate(
        "state_unavailable",
        "The receptionist could not read this thread's history, so it did not reply. Please answer this one.",
      ),
      tell(
        n.body ?? `[${raw.type}]`,
        "(no reply sent — the receptionist could not read the thread state)",
        "state unavailable",
      ),
      sink.processed(),
    ]);
    return;
  }

  // CONSENT GATE — before every branch below that can send, because all of
  // them could: the non-text acknowledgement, the brain's reply, even the
  // greeting fallback. Until now `consent` was written by ingest and read by
  // nothing, so texting STOP recorded the opt-out and then got an AI reply in
  // the same request.
  //
  // Two independent sources, and either is enough:
  //   n.optOut  — THIS message is the opt-out. Local knowledge, no database
  //               needed, so it holds even when Postgres is unreachable.
  //   ing.dnc   — they opted out earlier, per Postgres, which owns consent.
  //
  // Nothing is sent back — not even a confirmation. A tenant-authored opt-out
  // acknowledgement is a config item, and inventing copy in the salon's voice
  // is exactly what the brain profile exists to prevent.
  const consent = resolveConsent({
    optOutNow: n.optOut,
    optInNow: n.optIn,
    // Absence is not an answer. `consent` and `dnc` are optional on the ingest
    // result (packages/db ingest.ts) — "readers must treat absence as 'nothing
    // on record', never as a block" — and a row carrying neither read as
    // `false`, an affirmative "they are opted in".
    recorded: ing && (ing.consent !== undefined || ing.dnc !== undefined) ? isOptedOutContact(ing) : null,
  });
  const optedOut = consent.optedOut;

  if (optedOut) {
    const post: Promise<unknown>[] = [sink.processed()];
    if (n.optOut) {
      // Only on the opt-out message itself. upsertEscalation keeps ONE open
      // escalation per conversation, so a repeated STOP updates rather than
      // piles up — but a customer leaving is a business event the owner should
      // see once, not a log line.
      post.push(
        sink.escalate(
          "opt_out",
          "Customer asked to stop receiving messages. Automatic replies are off for this contact until they text START.",
        ),
        tell(n.body ?? `[${raw.type}]`, "(no reply sent — the customer opted out)", "opt-out"),
      );
    }
    await Promise.all(post);
    // `decided_by` matters after the fact: which of the two sources held them out.
    L.info("wa_skip_opt_out", {
      this_message: n.optOut,
      on_record: ing?.consent ?? null,
      decided_by: consent.source,
    });
    return;
  }

  // THE CARRIERS' HOLD (a line not yet approved for texting). The text is
  // kept above; it is held for a person with its own reason, and nothing is
  // answered until the line is approved. After consent, which outranks it;
  // before every branch that can speak.
  if (carrier?.held) {
    await Promise.all([
      sink.escalate(carrier.held.reason, carrier.held.details),
      tell(
        n.body ?? `[${raw.type}]`,
        "(no reply sent — the carriers have not approved this line for texting yet)",
        "carriers",
      ),
      sink.processed(),
    ]);
    L.info("sms_held_for_carriers");
    return;
  }

  // Routing is on the NORMALIZED type, not the raw one. A quick-reply tap or a
  // list selection arrives as type "button"/"interactive" with the customer's
  // words in a different field; matching on raw.type sent every one of them down
  // the "I can't read that" path. normalizeInbound resolves what they chose.
  // Nothing was asked of us. A customer tapping a thumbs-up on the
  // receptionist's reply is the commonest gesture on WhatsApp, and it used to
  // be answered with "sorry, I can't read that", followed by the receptionist
  // going silent on that customer for twenty-four hours, an escalation, an
  // email to the owner, and a deadman nag two hours later. A system notice is
  // not from the customer at all. Both are already persisted by ingest; record
  // that we handled them and stop.
  if (n.kind === "reaction" || n.kind === "system") {
    L.info("wa_skip_no_request", { kind: n.kind });
    await sink.processed();
    return;
  }

  // Readable, but not ours to answer. A pin drop or a contact card is
  // perfectly legible to a person — the customer is telling the salon
  // something, and normalizeInbound has already written it as a sentence. What
  // would be wrong is the apology: acknowledging it as unreadable tells the
  // customer we did not receive what they plainly sent. So this escalates like
  // the branch below, without the ack and without muting the receptionist.
  if (n.kind === "location" || n.kind === "contacts") {
    await Promise.all([
      sink.escalate("non_text", `${n.body} — needs a person.`),
      tell(n.body ?? `[${raw.type}]`, "(no reply sent — passed to a human)", n.kind),
      sink.processed(),
    ]);
    L.info("wa_escalate_readable_nontext", { kind: n.kind });
    return;
  }
  return GO;
}
