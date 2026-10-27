/**
 * The first phase of answerInbound (./answer.ts, its only caller): the message recorded, its memory read and the ways
 * out bound, before any gate decides whether the receptionist may speak (decision 0001).
 *
 * ingestMessage takes the InboundContext that openInbound bound and returns Ingested (./context.ts), or nothing when
 * the message stops here. A short code (a sender nothing can be sent back to) is recorded and not answered, and so is a
 * sender off the pilot allowlist, which binds only the environment's own WhatsApp number and is compared as digits on
 * both sides. A redelivery stops at the replay gate, the ingest's own new-or-seen claim; processed-state is not
 * consulted, because a missed auto-reply beats a double text. Every other message is persisted before anything can
 * fail, its memory is read back through the persist port (a thread that cannot be read comes back UNKNOWN, and
 * ./gates.ts hands it to a person), an address the customer gives in their own typed or tapped words is kept where none
 * is on file, and the three ways out that every later phase speaks through are bound here, where the credentials are:
 * wire shapes the words for the carrier (the texting footer on a first reply), send goes through the sink's one door,
 * which re-reads consent, the pause and the workspace's status, and tell is the owner's handoff mail.
 *
 * A text is answered after its acknowledgement (decision 0031, Phase 2): its door records it (recordMessage, which sets
 * aside a short code and a sender off the allowlist as the whole phase does) and answers Twilio, and a job takes it up
 * again through the whole phase with `resume`. Its ingest is then a redelivery by construction, so the replay gate lets
 * it through while the message is unprocessed and nothing has answered it yet (the persist port's `answered`, which
 * reads the reply that names it): a job taken up again after a runner died mid-turn still answers, and one whose turn
 * already reached a reply says nothing twice and leaves the stamp to the deadman sweep.
 *
 * Persist first is the rule: the allowlist and the short code gate the reply, never the persist. An ingest the database
 * refused throws IngestFailed (./ports.ts) after a best-effort copy of the customer's words goes to the workspace's
 * handoff mail; the WhatsApp door counts it into a 503, so Meta redelivers, and the SMS door refuses with a 503 and
 * alerts the platform on the same signal.
 */
import { shortCode, addressInMessage } from "@chanlytics/contracts";
import type { SendPurpose } from "@chanlytics/contracts";
import type { IngestResult, Json } from "@chanlytics/db";
import type { Wire } from "../deliver";
import { type EscalateOutcome, IngestFailed } from "./ports";
import { toldFromItsEvent } from "../subscribers";
import { handledOf, SET_ASIDE } from "./handled";
import type { ThreadState } from "./thread";
import { errField } from "@chanlytics/channels";
import type { HoldWords, InboundContext, Ingested } from "./context";

// Persist first, or say so. An ingest write that fails is the one loss the
// provider can undo: the customer's words go to the workspace mailbox as a
// copy, and IngestFailed travels up to the webhook, which answers 503 so
// Meta redelivers (the ingest's is_new gate makes that idempotent). Twilio
// retries nothing, so the SMS ingress alerts the platform on the same signal.
async function ingestOrSay(cx: InboundContext, jobFollows = false): Promise<IngestResult | null> {
  const { ports, db, tenantId, n, from, notifyTarget, L, channel } = cx;
  try {
    // The line it came in on (the routed channel) travels with the message: the person it makes keeps it (K3). A door
    // that schedules the message's answer says so (jobFollows): a yes the message carried that fails to land here is
    // the job's to write, and it raises if it cannot (db ingestInbound).
    return await ports.persist.ingest(
      db,
      tenantId,
      n,
      cx.routed?.channelId ?? null,
      jobFollows ? { jobFollows } : undefined,
    );
  } catch (e) {
    // A message that IS kept, whose yes did not land (kept), loses no words: no copy goes to the mailbox saying it was
    // not recorded. The throw still travels: the provider sends it again, or the job is tried again.
    if (e instanceof IngestFailed && !e.kept) {
      // The copy is best effort: a mailbox that cannot be reached must not mask the loss.
      try {
        await ports.alertStaff(
          from,
          n.body ?? `[${n.rawType} message]`,
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
 * A one-time code, as services word one: four to eight digits (a letter prefix allowed, "G-123456") with the word for a
 * code beside them -- "verification code is 482913", "482913 is your login code", "use 4829 to sign in" -- or the line
 * asking it never be shared. A code word is required, so a person's own numbers are theirs: a one-time clean of 1,200
 * sq ft, a security deposit of 2,500, a log-in error 5003, a gate code, a confirmation code (the review of 11 Oct 2026
 * found the first draft took all of those). A long message is a person's.
 */
const KIND_OF_CODE = String.raw`(?:verification|security|one[- ]time|log ?in|sign[- ]in|authentication|2fa|otp)`;
const A_CODE = String.raw`(?:[A-Z]{1,3}-)?\d{4,8}`;
const ONE_TIME_CODE = new RegExp(
  [
    String.raw`\b${KIND_OF_CODE}\s+(?:code|pin|passcode)\b[^\n]{0,20}?\b${A_CODE}\b`,
    String.raw`\b${A_CODE}\s+is\s+your\b[^\n]{0,40}?\b(?:code|pin|passcode)\b`,
    String.raw`\buse\s+${A_CODE}\s+to\s+(?:sign in|log in|login|verify|confirm)\b`,
    String.raw`\b(?:do not|don'?t|never) share (?:this|the|your) code\b`,
  ].join("|"),
  "i",
);
function oneTimeCode(body: string | null | undefined): boolean {
  const t = (body ?? "").trim();
  return t.length > 0 && t.length <= 320 && ONE_TIME_CODE.test(t);
}

/**
 * A sender the receptionist never answers, recorded and set aside: a short code, a one-time code from any number, or
 * a sender off the pilot allowlist. True when the message was one, and is finished with.
 */
async function setAside(cx: InboundContext): Promise<boolean> {
  const { ports, tenantId, isEnvDefault, from, channel, db, rt } = cx;
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
    await sink.processed(handledOf(SET_ASIDE));
    return true;
  }

  // A one-time code a service sent from an ordinary number reads like a person's text to everything else, and was
  // answered with a sales reply (the engine review's second pass, 11 Oct 2026). Recorded for the owner, not answered.
  if (oneTimeCode(cx.n.body)) {
    const ing = await recordOrSay();
    const sink = ports.persist.sink(db, tenantId, ing, rt, channel);
    cx.L.info("one_time_code_set_aside");
    await sink.processed(handledOf(SET_ASIDE));
    return true;
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
    await sink.processed(handledOf(SET_ASIDE));
    return true;
  }
  return false;
}

/**
 * The door's half of a message answered after its acknowledgement: set aside, or recorded. The ingest's row when the
 * message waits for its answer, nothing when it was set aside or is a redelivery; IngestFailed when the write failed,
 * which the door answers with a 503 so the provider sends it again.
 */
export async function recordMessage(cx: InboundContext): Promise<IngestResult | null | undefined> {
  if (await setAside(cx)) return undefined;
  // The door that calls this schedules the message's answer next (a text's, a WhatsApp message answered later), and that
  // job takes the message in again: a yes it carried that does not land now is written there, or the job is tried again.
  const ing = await ingestOrSay(cx, true);
  return ing && !ing.is_new ? undefined : ing;
}

/**
 * Whether a message taken up again already has its answer: a reply names it, whatever became of it (it left, waits or
 * was withdrawn as a draft, or the wire refused it). The turn that wrote it died between its answer and its stamp, so
 * nothing more is said and the stamp is left to the deadman sweep, which finds a reply after the message and stamps it
 * quietly, as it does for any turn that died there. Asked only of a redelivery the job resumes; a port that cannot say
 * is no answer yet.
 */
async function answeredBefore(cx: InboundContext, ing: IngestResult): Promise<boolean> {
  const { ports, db, tenantId, L } = cx;
  if (!ports.persist.answered || !(await ports.persist.answered(db, tenantId, ing))) return false;
  L.info("wa_resume_answered");
  return true;
}

/**
 * The message recorded and its memory read, with the three ways out bound; nothing when it stops here: a short
 * code, a sender off the pilot allowlist, or a redelivery. `resume` is the job that answers a text after its
 * acknowledgement: its own redelivery goes on while the message is unprocessed and unanswered.
 */
export async function ingestMessage(cx: InboundContext, resume = false): Promise<Ingested | undefined> {
  const { ports, n, tenantId, isEnvDefault, carrier, from, channel, db, t0, L, rt, notifyTarget } = cx;
  const recordOrSay = () => ingestOrSay(cx);
  if (await setAside(cx)) return;

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
  // carrier that brought the message in (a texting line, an Instagram account), on its own wire. Bound here, where the
  // credentials are; the door refuses when the wire for this channel is missing.
  const wires: Wire = {
    whatsapp: ports.sender(ports.waCfg(rt, isEnvDefault)),
    ...(carrier ? { [carrier.channel]: (to: string, p: { body: string }) => carrier.send(to, p.body) } : {}),
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
  // Whether a TEXT of ours has ever reached this person, which decides the rates/STOP/HELP footer the campaign filing
  // promises on a first text. Postgres answers it outright (ThreadState.textedBefore), and nothing else here could: the
  // history reads a voice call note as an assistant turn, and the day's replies and "anything ever left" count every
  // wire, so a person a WhatsApp or email campaign had reached, or the receptionist had answered on WhatsApp that day,
  // got their first text without the disclosure. A thread that does not say falls back to what this asked before.
  const firstReply =
    thread.textedBefore === undefined
      ? thread.replies.length === 0 && !thread.history.some((h) => h.role === "assistant")
      : !thread.textedBefore;
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
  const tell = async (
    asked: Promise<EscalateOutcome> | null,
    { said, answered, why, pausedHours = null }: HoldWords,
  ) => {
    // A hold written is told from its event (decision 0043): once, after the commit, out of this request. One whose
    // write failed, or a deployment with no database to write it in, is told here, as it was decided.
    if (toldFromItsEvent(asked ? await asked.catch(() => undefined) : undefined)) return;
    await ports.alertStaff(from, said, answered, why, {
      target: notifyTarget,
      channel,
      pausedHours,
      route: ing ? `inbox/th-${ing.conversation_id}` : "inbox",
      who: n.profileName ?? null,
      about: ing ? { type: "conversation", id: ing.conversation_id } : null,
    });
  };

  // Atomic concurrent-redelivery gate. ingest_inbound's is_new claim IS the
  // dedupe, and it is stronger than the `seen` array the retired store kept (a
  // unique index two concurrent lambdas cannot both miss).
  // A missed auto-reply beats a double text, so processed-state is deliberately
  // not consulted -- but by the job that answers a text after its acknowledgement, whose ingest is always a
  // redelivery: it goes on while the message is unprocessed and no reply names it yet.
  if (ing && !ing.is_new && !(resume && !ing.processed && !(await answeredBefore(cx, ing)))) {
    L.info("wa_skip_pg_dupe");
    return;
  }
  return { ing, thread, ingestMs, sink, wire, send, tell };
}
