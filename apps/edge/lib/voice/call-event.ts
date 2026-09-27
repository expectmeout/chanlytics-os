/**
 * A call event arrives from the provider: everything the webhook decides once
 * the ingest has answered, apart from the transport.
 *
 * WHY THIS IS A FUNCTION AND NOT THE ENDPOINT. Whether the thread gets its
 * note, whether the hold on it is renewed or let go, whether a person is
 * handed the caller, whether the owner is told a price was quoted and the
 * receptionist corrected, whether the audio is copied, whether the owner is
 * told at all -- every one of those was decided inside one 400-line handler
 * body, and could only be proved by running the whole door. The house answers
 * this the same way each time: judgeHealth apart from the health route,
 * callbackPlan apart from the OAuth return, planSmsIngress apart from the
 * texting door, planCallStart apart from the inbound-call door. This is the
 * call webhook's.
 *
 * IT RETURNS THE WRITES RATHER THAN MAKING THEM, in the order the door makes
 * them, because the order is observable: the receptionist is corrected
 * before the notification is claimed, so a provider that fails the
 * correction fails the delivery before the claim and the retry still tells
 * the owner. The door applies the steps one by one and stops at the first
 * throw, exactly as the one body did.
 *
 * PURE. Nothing here reads a database, the environment or the clock. The
 * facts are the ingest's answer -- the row, the person and the thread as the
 * database resolved them -- and the two things only the door knows: whether
 * this instance has already corrected the receptionist on this call, and
 * whether it holds the provider's key.
 */
import type { IngestCallResult } from "../packages/db.js";
import type { NormalizedCall, RetellCall } from "../packages/channels.js";
import { callSummaryLine } from "../packages/channels.js";
import { callOutcomeWords, formatPhoneDisplay, guardSpokenTurns } from "../packages/contracts.js";
import type { NotifyMessage } from "../ops/notify.js";
import type { ForwardingCall } from "./forwarding.js";
import type { CallForActivity } from "./call-activity.js";

/** The delivery as the door read it: the event, the call as the provider shaped it, and the row's view of it. */
interface CallEvent {
  event: string | undefined;
  call: RetellCall;
  n: NormalizedCall;
  /** The key names the delivery carried at its top level and inside `call` -- never the words. */
  bodyKeys: string[];
  callKeys: string[];
}

interface CallEventFacts {
  /** ingest_call's answer: the row and its recording state, whether the event was older than it, the person, the thread. */
  ingest: IngestCallResult;
  /** This instance has already told the receptionist about this call. */
  alreadyCorrected: boolean;
  /** The provider's API key is held, so a live call can be corrected. */
  canCorrect: boolean;
}

/** What the bell row is about: the call, or the thread when it needs a call back. */
export interface CallAbout {
  type: string;
  id: string;
}

/**
 * One thing the door does for this delivery, in the order the plan lists them.
 * A step that writes a row names its row; a step that leaves the process (the
 * correction through the provider, the copy of the audio) names what it needs.
 */
export type CallStep =
  | { kind: "log"; event: "retell_event_stale"; fields: Record<string, unknown> }
  | { kind: "forwarding_verified"; call: ForwardingCall }
  | { kind: "call_activity"; retellCallId: string; call: CallForActivity }
  | { kind: "delivery"; callId: string | null; data: Record<string, unknown> }
  | {
      kind: "note";
      conversationId: string;
      contactId: string | null;
      body: string;
      externalId: string;
      channelTsIso: string | null;
      callId: string;
    }
  | { kind: "hold"; conversationId: string; retellCallId: string; over: boolean }
  | { kind: "callback"; conversationId: string; details: string; callId: string }
  | {
      kind: "policy_block";
      conversationId: string;
      reason: "policy_block";
      details: string;
      turn: number;
      callId: string;
    }
  | { kind: "correct_live_call"; retellCallId: string; rule: "price" }
  | { kind: "claim_notification"; callId: string }
  | { kind: "copy_recording"; callId: string; providerUrl: string; attempts: number };

export interface CallEventPlan {
  steps: CallStep[];
  about: CallAbout | null;
}

/** A trimmed string, or nothing: the analysis's answers are the agent's free text. */
const said = (v: unknown): string => (typeof v === "string" && v.trim() ? v.trim() : "");

/**
 * What each delivery DID, as a row: the event, the status the payload
 * carried and the one it normalised to, how many turns it brought, whether
 * the ingest declined it. No content -- counts and flags only.
 */
function deliveryRow(e: CallEvent, res: IngestCallResult): Record<string, unknown> {
  const { event, call, n } = e;
  return {
    event: event ?? null,
    call_status: call.call_status ?? null,
    status: n.status,
    agent_id_present: !!call.agent_id,
    turns: n.transcriptObject?.length ?? null,
    tool_turns: call.transcript_with_tool_calls?.length ?? null,
    transcript_chars: n.transcript?.length ?? null,
    skipped: !!res.skipped,
    body_keys: e.bodyKeys,
    call_keys: e.callKeys,
  };
}

/** What the owner is told to do: the analysis's to-do, else what the caller wanted, else the fact itself. */
function callbackTodo(analysis: Record<string, unknown>): string {
  return said(analysis.follow_up) || said(analysis.caller_wanted) || "The caller needs a call back.";
}

/**
 * A STANDING RULE BROKEN OUT LOUD.
 *
 * On text, layerTwo swaps the words before the customer sees them. A call
 * has already been heard by the time its turns reach us, so the only thing
 * left to change is what the agent says NEXT -- and the owner is told either
 * way, which is the half that does not depend on the provider's per-turn
 * delivery being switched on.
 */
function guardSteps(n: NormalizedCall, res: IngestCallResult, f: CallEventFacts): CallStep[] {
  const guard = guardSpokenTurns({
    turns: n.transcriptObject,
    live: n.status === "ongoing",
    alreadyCorrected: f.alreadyCorrected,
  });
  const out: CallStep[] = [];
  if (guard.escalate && guard.breach && res.conversation_id) {
    out.push({
      kind: "policy_block",
      conversationId: res.conversation_id,
      reason: guard.escalate.reason,
      details: guard.escalate.details,
      turn: guard.breach.turn,
      callId: res.call_id,
    });
  }
  if (guard.correct && guard.breach && f.canCorrect) {
    out.push({ kind: "correct_live_call", retellCallId: n.retellCallId, rule: guard.breach.rule });
  }
  return out;
}

/**
 * Retell serves recordings from an UNSIGNED public CDN URL -- the audio is
 * copied into the private bucket so a customer's call isn't one guessed
 * link away, and so it survives provider retention. On a short budget: the
 * handler has the agent's 20 s delivery timeout over its head, and a copy
 * that does not finish is retried by the reconcile sweep. Never again once
 * stored, given up on, or removed on schedule: a purged call's audio was
 * taken out after its retention and must stay out.
 */
function recordingCopy(n: NormalizedCall, res: IngestCallResult, analyzed: boolean): CallStep | null {
  if (
    n.recordingUrl &&
    res.recording_state !== "stored" &&
    res.recording_state !== "failed" &&
    res.recording_state !== "purged" &&
    (analyzed || n.status === "ended")
  ) {
    return {
      kind: "copy_recording",
      callId: res.call_id,
      providerUrl: n.recordingUrl,
      attempts: res.recording_attempts ?? 0,
    };
  }
  return null;
}

export function planCallEvent(e: CallEvent, f: CallEventFacts): CallEventPlan {
  const { event, n } = e;
  const res = f.ingest;
  const analyzed = event === "call_analyzed";
  const steps: CallStep[] = [];

  // Keep my number, proven: an inbound call inside a forwarded line's test
  // window. Idempotent, and never in the way of the delivery. Awaited for the
  // same reason as the auth row: a call_started that reaches the answer with
  // nothing else to do is frozen before this lands, and the owner's Setup
  // page then says "Testing --" through the whole call it was waiting for.
  // Outside an open test window it is one select that returns nothing.
  if (res.call_id && n.direction === "inbound") {
    steps.push({
      kind: "forwarding_verified",
      call: {
        fromE164: n.fromE164,
        toE164: n.toE164,
        startedAtIso: n.startedAtIso,
        // Retell's id, as the inbound-call webhook records it: that door proves most tests first, before the call
        // has a row of ours.
        callId: n.retellCallId,
      },
    });
  }
  if (res.skipped) {
    // Older than the row: a retried call_started after call_ended, or a
    // partial transcript after the final one. Nothing was written.
    steps.push({ kind: "log", event: "retell_event_stale", fields: { retell_event: event, call_id: n.retellCallId } });
  }
  // The call on the phones' Lock Screens (00191, lib/voice/call-activity.ts): as it starts, to the phones of the
  // people who take calls; once, since a redelivered call_started finds the start claimed (00216). Best effort beside
  // the call's own door.
  if (event === "call_started" && !res.skipped && n.status === "ongoing") {
    steps.push({
      kind: "call_activity",
      retellCallId: n.retellCallId,
      call: {
        call_id: res.call_id,
        contact_id: res.contact_id,
        from_e164: n.fromE164,
        from_raw: n.fromRaw ?? null,
        to_e164: n.toE164,
        started_at: n.startedAtIso,
      },
    });
  }
  // Awaited: this row IS /api/diag's answer to "what did the provider
  // actually send", and the deliveries it was written for -- call_started
  // and the per-turn transcript updates -- are exactly the ones with no
  // awaited work after them, so they were the ones it never recorded.
  steps.push({ kind: "delivery", callId: res.call_id ?? null, data: deliveryRow(e, res) });

  // The call belongs in the customer's one thread, not a silo -- written
  // once the SUMMARY exists. Message bodies are immutable (P3), and a note
  // written on call_ended read "No summary available." forever: in the
  // thread, in the WhatsApp bot's memory, and read aloud as the caller's
  // context on their next call. A call the provider never analyses gets its
  // line from the reconcile sweep instead.
  if (res.conversation_id && (analyzed || n.summary !== null || n.inVoicemail === true)) {
    steps.push({
      kind: "note",
      conversationId: res.conversation_id,
      contactId: res.contact_id,
      body: callSummaryLine(n),
      externalId: `call:${n.retellCallId}`,
      channelTsIso: n.startedAtIso,
      callId: res.call_id,
    });
  }

  // The hold this call has on the caller's thread (00132), taken at the
  // inbound door so the text receptionist does not answer the same person
  // while they are on the phone. A call that is over lets it go; a call
  // still running renews it, which is what keeps a long one from lapsing
  // mid-sentence. Only ever its OWN hold: a person who took the thread over
  // during the call keeps it, because release names the holder.
  if (res.conversation_id) {
    steps.push({
      kind: "hold",
      conversationId: res.conversation_id,
      retellCallId: n.retellCallId,
      over: n.status === "ended" || n.status === "error" || analyzed,
    });
  }

  // The analysis says a person must call them back: the thread lands on
  // Needs you with what to do, and the receptionist steps aside on it for
  // the workspace's pause, exactly as a WhatsApp handoff does. A replay
  // refreshes the one open escalation rather than opening a second. The
  // bell is then about the thread, which is where the work is.
  let about: CallAbout | null = res.call_id ? { type: "call", id: res.call_id } : null;
  if (analyzed && res.conversation_id && n.analysis?.outcome === "callback_needed") {
    steps.push({
      kind: "callback",
      conversationId: res.conversation_id,
      details: callbackTodo(n.analysis).slice(0, 400),
      callId: res.call_id,
    });
    about = { type: "conversation", id: res.conversation_id };
  }

  steps.push(...guardSteps(n, res, f));

  // The email and the memory note happen ONCE per call. Retell retries a
  // slow delivery and replays inside the signature window; the claim is what
  // makes the second delivery a no-op.
  if (analyzed) steps.push({ kind: "claim_notification", callId: res.call_id });

  const copy = recordingCopy(n, res, analyzed);
  if (copy) steps.push(copy);
  return { steps, about };
}

/**
 * The owner's notice of an analysed call: the bell row and the mail, in the
 * owner's words, name first ("Emily phoned · 3 min · needs a call back").
 * What the analysis said leads the body -- the request, the outcome, the
 * to-do -- and the provider's summary and the transcript follow. The
 * redacted body is what a platform operator may be told about a workspace
 * that cannot be addressed: no summary, no words.
 */
export function callNotice(n: NormalizedCall, call: RetellCall, about: CallAbout | null): NotifyMessage {
  const summary = n.summary || "(no summary)";
  const sentiment = n.sentiment || "n/a";
  const wanted = said(n.analysis?.caller_wanted);
  const outcomeWords = callOutcomeWords(n.analysis?.outcome);
  const followUp = said(n.analysis?.follow_up);
  const callback = n.analysis?.outcome === "callback_needed";
  const durationS = n.durationMs ? Math.round(n.durationMs / 1000) : 0;
  const who = said(n.analysis?.caller_name) || formatPhoneDisplay(call.from_number) || "Unknown caller";
  const length = durationS >= 60 ? `${Math.round(durationS / 60)} min` : `${durationS} s`;
  return {
    kind: "call",
    route: "conversations/phone",
    about,
    subject: `${who} phoned · ${length}${callback ? " · needs a call back" : ""}`,
    body:
      (wanted ? `They wanted: ${wanted}.\n` : `${summary}\n`) +
      (outcomeWords ? `Outcome: ${outcomeWords}.\n` : "") +
      (followUp ? `To do: ${followUp}\n` : "") +
      `\nFrom ${call.from_number || "unknown"} · ${durationS}s · sentiment ${sentiment} · ended: ${n.disconnectionReason || "n/a"}\n` +
      `\nSummary:\n${summary}\n\n` +
      `Transcript:\n${String(n.transcript || "(none)").slice(0, 3000)}`,
    redactedBody: `A voice call was handled for a workspace (${durationS}s). The summary and transcript were withheld.`,
  };
}
