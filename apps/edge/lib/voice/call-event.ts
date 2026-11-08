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
import type { IngestCallResult } from "@chanlytics/db/voice";
import type { NormalizedCall, RetellCall } from "@chanlytics/channels/voice";
import { callSummaryLine } from "@chanlytics/channels/voice";
import {
  addressOf,
  callAttemptWords,
  callEndingOf,
  callerName,
  callOutcomeWords,
  DISCONNECTION_LABELS,
  formatPhoneDisplay,
  guardSpokenTurns,
  missedCall,
  neverConnected,
  unansweredCallTodo,
} from "@chanlytics/contracts";
import type { NotifyMessage } from "../shared/alerts/notify.js";
import type { ForwardingCall } from "./forwarding.js";
import type { CallForActivity } from "./call-activity.js";
import type { ContactId } from "@chanlytics/contracts";

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
  /**
   * The receptionist has already been corrected on this call. The door says false and lets the call's own claim decide
   * (guard_corrected_at, claimed as the correction is made): a call whose turns reach two instances is corrected once.
   */
  alreadyCorrected: boolean;
  /** The provider's API key is held, so a live call can be corrected. */
  canCorrect: boolean;
  /**
   * The prices the receptionist may say on this call (contracts priceAllowance): the amounts the owner wrote while
   * "Never quote a price" is off. Null is the strict rule, any price at all: the door reads it only when the turns hold
   * a price, and a workspace it could not read is strict. Required, so the door says which.
   */
  allowed: ReadonlySet<string> | null;
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
      contactId: ContactId | null;
      body: string;
      externalId: string;
      channelTsIso: string | null;
      callId: string;
    }
  | { kind: "hold"; conversationId: string; retellCallId: string; over: boolean }
  | {
      kind: "callback";
      conversationId: string;
      details: string;
      callId: string;
      endedAtIso: string | null;
      /** Whether the receptionist steps aside on the thread for the workspace's pause: a call it could not finish. */
      pause: boolean;
    }
  | {
      kind: "policy_block";
      conversationId: string;
      reason: "policy_block";
      details: string;
      turn: number;
      callId: string;
    }
  | { kind: "correct_live_call"; retellCallId: string; callId: string; rule: "price" }
  /** A call that ended the platform's way (contracts callEndingOf: the provider's account, our webhook, its error). */
  | { kind: "page_platform"; reason: string; words: string; mend: string }
  | { kind: "claim_notification"; callId: string }
  | { kind: "copy_recording"; callId: string; providerUrl: string; attempts: number };

export interface CallEventPlan {
  steps: CallStep[];
  about: CallAbout | null;
  /** The call's own row (calls.id), which the owner's notice of it opens; null where the delivery made none. */
  callId: string | null;
}

/** A trimmed string, or nothing: the analysis's answers are the agent's free text. */
const said = (v: unknown): string => (typeof v === "string" && v.trim() ? v.trim() : "");

/**
 * What each delivery DID, as a row: the event, the status the payload
 * carried and the one it normalised to, how many turns it brought, whether
 * the ingest declined it. No content -- counts and flags only.
 */
function deliveryRow(callEvent: CallEvent, res: IngestCallResult): Record<string, unknown> {
  const { event, call, n } = callEvent;
  return {
    event: event ?? null,
    call_status: call.call_status ?? null,
    status: n.status,
    agent_id_present: !!call.agent_id,
    turns: n.transcriptObject?.length ?? null,
    tool_turns: call.transcript_with_tool_calls?.length ?? null,
    transcript_chars: n.transcript?.length ?? null,
    skipped: !!res.skipped,
    body_keys: callEvent.bodyKeys,
    call_keys: callEvent.callKeys,
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
function guardSteps(normalizedCall: NormalizedCall, res: IngestCallResult, callEventFacts: CallEventFacts): CallStep[] {
  const guard = guardSpokenTurns({
    turns: normalizedCall.transcriptObject,
    live: normalizedCall.status === "ongoing",
    alreadyCorrected: callEventFacts.alreadyCorrected,
    allowed: callEventFacts.allowed,
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
  if (guard.correct && guard.breach && callEventFacts.canCorrect) {
    out.push({
      kind: "correct_live_call",
      retellCallId: normalizedCall.retellCallId,
      callId: res.call_id,
      rule: guard.breach.rule,
    });
  }
  return out;
}

/**
 * Retell serves recordings from its CDN by a signed link that lasts a day
 * (every agent has opt_in_signed_url on) -- the audio is copied into the
 * private bucket so a customer's call is ours to keep and to erase, and so it
 * survives the provider's week (CALL_LIMITS). On a short budget: the
 * handler has the agent's 20 s delivery timeout over its head, and a copy
 * that does not finish is retried by the reconcile sweep. Never again once
 * stored, given up on, or removed on schedule: a purged call's audio was
 * taken out after its retention and must stay out.
 */
function recordingCopy(normalizedCall: NormalizedCall, res: IngestCallResult, analyzed: boolean): CallStep | null {
  if (
    normalizedCall.recordingUrl &&
    res.recording_state !== "stored" &&
    res.recording_state !== "failed" &&
    res.recording_state !== "purged" &&
    (analyzed || normalizedCall.status === "ended")
  ) {
    return {
      kind: "copy_recording",
      callId: res.call_id,
      providerUrl: normalizedCall.recordingUrl,
      attempts: res.recording_attempts ?? 0,
    };
  }
  return null;
}

/**
 * A customer's call that reached no answer: it never connected, or they hung up without a word. Each is owed a call back,
 * so each opens the thread's callback hold as the call ends (a replay refreshes the one open hold), and a call back
 * closes it (00422). Nothing paused: the receptionist still answers what they write (the closed-loop audit of 17 Oct
 * 2026, C; apart from the missed-call text declined on 11 Oct, since nothing is sent). Null for any other delivery.
 */
function owedACallBack(
  event: CallEvent["event"],
  normalizedCall: NormalizedCall,
  res: IngestCallResult,
): Extract<CallStep, { kind: "callback" }> | null {
  if (event !== "call_ended" || res.skipped || !res.conversation_id || !res.call_id) return null;
  const todo = unansweredCallTodo({
    direction: normalizedCall.direction,
    status: normalizedCall.status,
    duration_ms: normalizedCall.durationMs,
    disconnection_reason: normalizedCall.disconnectionReason,
    in_voicemail: normalizedCall.inVoicemail,
    outcome: null,
    transcript_object: normalizedCall.transcriptObject,
  });
  return todo
    ? {
        kind: "callback",
        conversationId: res.conversation_id,
        details: todo,
        callId: res.call_id,
        endedAtIso: normalizedCall.endedAtIso,
        pause: false,
      }
    : null;
}

export function planCallEvent(callEvent: CallEvent, callEventFacts: CallEventFacts): CallEventPlan {
  const { event, n } = callEvent;
  const res = callEventFacts.ingest;
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
  // people who take calls; once, since a redelivered call_started finds the start claimed (00221). Best effort beside
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
  steps.push({ kind: "delivery", callId: res.call_id ?? null, data: deliveryRow(callEvent, res) });

  const note = noteStep(event, n, res);
  if (note) steps.push(note);
  const hold = holdStep(n, res, analyzed);
  if (hold) steps.push(hold);

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
      // When the call ended, so the pause is measured from the call and not from this delivery (G9).
      endedAtIso: n.endedAtIso,
      pause: true,
    });
    about = { type: "conversation", id: res.conversation_id };
  }
  const owed = owedACallBack(event, n, res);
  if (owed) {
    steps.push(owed);
    about = { type: "conversation", id: owed.conversationId };
  }

  steps.push(...guardSteps(n, res, callEventFacts));

  const page = platformPage(event, n, res);
  if (page) steps.push(page);

  // The email and the memory note happen ONCE per call. Retell retries a
  // slow delivery and replays inside the signature window; the claim is what
  // makes the second delivery a no-op. A customer's call that never connected
  // is told once by the same claim: it may never be analysed (missedCallNotice).
  if (analyzed || (!res.skipped && isMissedCall(n))) steps.push({ kind: "claim_notification", callId: res.call_id });

  const copy = recordingCopy(n, res, analyzed);
  if (copy) steps.push(copy);
  return { steps, about, callId: res.call_id ?? null };
}

/**
 * The call's line in the customer's one thread, not a silo, written once the SUMMARY exists. Message bodies are
 * immutable (P3), and a note written on call_ended read "No summary available." forever: in the thread, in the WhatsApp
 * bot's memory, and read aloud as the caller's context on their next call. A call the provider never analyses gets its
 * line from the reconcile sweep instead. A missed call has nothing to summarise and is told as it ends
 * (MISSED_CALL_LINE), so the text receptionist and the next call know they rang (decision 0092).
 */
function noteStep(event: CallEvent["event"], normalizedCall: NormalizedCall, res: IngestCallResult): CallStep | null {
  if (!res.conversation_id) return null;
  const missedNow = event === "call_ended" && !res.skipped && isMissedCall(normalizedCall);
  if (event !== "call_analyzed" && normalizedCall.summary === null && normalizedCall.inVoicemail !== true && !missedNow)
    return null;
  return {
    kind: "note",
    conversationId: res.conversation_id,
    contactId: res.contact_id,
    body: callSummaryLine(normalizedCall),
    externalId: `call:${normalizedCall.retellCallId}`,
    channelTsIso: normalizedCall.startedAtIso,
    callId: res.call_id,
  };
}

/**
 * The hold this call has on the caller's thread (00132), taken at the inbound door so the text receptionist does not
 * answer the same person while they are on the phone. A call that is over lets it go; a call still running renews it,
 * which is what keeps a long one from lapsing mid-sentence. Only ever its OWN hold: a person who took the thread over
 * during the call keeps it, because release names the holder. A delivery older than the row (skipped) says nothing
 * about the call now: a retried call_started after the end would renew a hold the end let go, and the caller's next
 * text would go unanswered for fifteen minutes.
 */
function holdStep(n: NormalizedCall, res: IngestCallResult, analyzed: boolean): CallStep | null {
  if (!res.conversation_id || res.skipped) return null;
  // A call that never connected is over too: renewing its hold kept the receptionist off the thread until it lapsed.
  const over = analyzed || n.status === "ended" || n.status === "error" || n.status === "not_connected";
  return { kind: "hold", conversationId: res.conversation_id, retellCallId: n.retellCallId, over };
}

/**
 * A call that ended the platform's way is the platform's to mend, now: the provider's credit or payment, too many calls
 * at once, our own inbound webhook, a provider's error. Every other call to every workspace may end the same way until
 * it is (callEndingOf; the page is once per reason per window, pageOperator).
 */
function platformPage(
  event: CallEvent["event"],
  normalizedCall: NormalizedCall,
  res: IngestCallResult,
): CallStep | null {
  if (event !== "call_ended" || res.skipped || !normalizedCall.disconnectionReason) return null;
  const ending = callEndingOf(normalizedCall.disconnectionReason);
  if (!ending?.pages) return null;
  return {
    kind: "page_platform",
    reason: normalizedCall.disconnectionReason,
    words: ending.platform,
    mend: ending.mend ?? "Look the call up in the voice provider's log by its time.",
  };
}

/**
 * A customer's call that never connected (contracts missedCall over neverConnected): the one the receptionist placed and
 * nobody answered is no one's missed call, and one the carrier flagged as spam is not news to the owner.
 */
export function isMissedCall(
  normalizedCall: Pick<NormalizedCall, "status" | "direction" | "disconnectionReason">,
): boolean {
  return (
    missedCall({ missed: neverConnected(normalizedCall), direction: normalizedCall.direction }) &&
    normalizedCall.disconnectionReason !== "marked_as_spam"
  );
}

/**
 * The owner's notice of a customer's call that never connected (the wiring's second audit, R11 S6-8). The bell's
 * "Missed call" row was derived in a browser that held the calls, so with the app closed nothing was kept, mailed or
 * pushed, and a dial that never connected may never be analysed, which is when every other call is told. Kept as a
 * call's notice, so the owner's choice for calls decides the mail and the phones are told; once per call, by the same
 * claim as an analysed call's; opening the call. The bell shows it in place of the row it derived (dedupeFeed).
 */
export function missedCallNotice(
  normalizedCall: NormalizedCall,
  saved: string | null,
  callId: string | null,
): NotifyMessage {
  const personName =
    saved || callerName({ from_e164: normalizedCall.fromE164, from_raw: normalizedCall.fromRaw, contact: null });
  return {
    kind: "call",
    route: callId ? addressOf({ kind: "call", id: callId }) : "conversations/phone",
    about: callId ? { type: "call", id: callId } : null,
    subject: `${callAttemptWords("inbound")} · ${personName}`,
    body:
      `${normalizedCall.fromE164 ? `${normalizedCall.fromE164} rang` : "A caller rang"} and the call never connected, so nobody spoke with them. ` +
      "Call them back, or write to them from their thread.",
    redactedBody: "A customer's call to a workspace never connected.",
  };
}

/**
 * The owner's notice of an analysed call: the bell row and the mail, in the
 * owner's words, name first ("Emily phoned · 3 min · needs a call back"). It opens the call it is about
 * (`conversations/cv-<call>`, as the Today queue's "Open the call" does), even when the row is about the thread for a call
 * back: the summary is the call's.
 * The name is the one the owner saved for the caller (`saved`: their name, else
 * their WhatsApp name), as every page names a caller (contracts callerName);
 * with none saved, what the caller said of themselves, then their number, or that it was withheld.
 * What the analysis said leads the body -- the request, the outcome, the
 * to-do -- and the provider's summary and the transcript follow. The
 * redacted body is what a platform operator may be told about a workspace
 * that cannot be addressed: no summary, no words.
 */
export function callNotice(
  normalizedCall: NormalizedCall,
  call: RetellCall,
  about: CallAbout | null,
  saved: string | null,
  callId: string | null,
): NotifyMessage {
  const summary = normalizedCall.summary || "(no summary)";
  const wanted = said(normalizedCall.analysis?.caller_wanted)?.replace(/[.\s]+$/u, "");
  const outcomeWords = callOutcomeWords(normalizedCall.analysis?.outcome);
  const followUp = said(normalizedCall.analysis?.follow_up);
  const callback = normalizedCall.analysis?.outcome === "callback_needed";
  const durationS = normalizedCall.durationMs ? Math.round(normalizedCall.durationMs / 1000) : 0;
  // Then the line, as every page says it (contracts callerName): the number, or that it was withheld.
  const personName =
    saved ||
    said(normalizedCall.analysis?.caller_name) ||
    callerName({ from_e164: normalizedCall.fromE164, from_raw: normalizedCall.fromRaw, contact: null });
  const length = durationS >= 60 ? `${Math.round(durationS / 60)} min` : `${durationS} s`;
  // How it ended in the call page's words (contracts DISCONNECTION_LABELS), never the provider's code.
  const reason = normalizedCall.disconnectionReason;
  const ended = reason ? (DISCONNECTION_LABELS[reason] ?? reason.replace(/_/g, " ")) : null;
  return {
    kind: "call",
    route: callId ? addressOf({ kind: "call", id: callId }) : "conversations/phone",
    about,
    subject: `${personName} phoned · ${length}${callback ? " · needs a call back" : ""}`,
    body:
      (wanted ? `They wanted: ${wanted}.\n` : `${summary}\n`) +
      (outcomeWords ? `Outcome: ${outcomeWords}.\n` : "") +
      (followUp ? `To do: ${followUp}\n` : "") +
      `\nFrom ${formatPhoneDisplay(call.from_number) ?? (call.from_number || "unknown")} · ${length}${ended ? ` · ${ended}` : ""}\n` +
      `\nSummary:\n${summary}\n\n` +
      `Transcript:\n${String(normalizedCall.transcript || "(none)").slice(0, 3000)}`,
    redactedBody: `A voice call was handled for a workspace (${durationS}s). The summary and transcript were withheld.`,
  };
}
