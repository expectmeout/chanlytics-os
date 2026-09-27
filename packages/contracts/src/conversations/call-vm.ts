/**
 * A call's row and transcript (`toCallVM`), and a call's length in words. The call as the wire gives it, and
 * how it ended, is call-dto.ts; the caller's name and the times come from thread-contact.ts and thread-clock.ts.
 */
import { callLength } from "../shared/clock";
import { whisperText } from "../voice/whisper";
import { callerName } from "../people/person-name";
import { isLiveCall } from "../config/policy";
import { callOutcomeOf, callOutcomeWords, tidyCallSummary } from "../voice/call-words";
import { RECORDING_PURGED_WORDS, RECORDING_RETENTION_DAYS } from "../workspace/retention";
import { isIdentifierName, initialsOf } from "./thread-contact";
import { shortTime } from "./thread-clock";
import { abandonedCall, DISCONNECTION_LABELS, type CallDto } from "./call-dto";

/* ---- Calls (Slice 3): a call row answers "is my AI saying the right things
   on the phone", while the thread answers "am I on the hook to reply". A call
   row therefore carries NO decision affordance — only a link back to the
   thread, so exactly one queue owns "needs you". ---- */

export interface CallVM {
  id: string;
  real: true;
  callId: string;
  who: string;
  whoShort: string;
  initials: string;
  clientId: string | null;
  channel: "phone";
  agent: { glyph: string; name: string };
  at: string;
  duration?: string;
  ts: number;
  /** live: in progress under the heartbeat rule · missed: the dial never
   *  connected (Retell's not_connected) · handled: everything else. */
  outcome: "live" | "handled" | "missed" | "callback" | "abandoned";
  live?: boolean;
  snippet: string;
  summary: { headline: string; bullets: string[] };
  /** Each line with its moment in the call, in seconds: where it starts and where it ends (null for a whisper, which
   *  is not a sound in the recording). The thread plays from a line and lights the one being said by these. */
  transcript: Array<{
    t: string;
    speaker: "agent" | "client" | "whisper";
    text: string;
    start: number | null;
    end: number | null;
  }>;
  /** The call's length in seconds: the player's track before the audio says its own. */
  durationSec: number | null;
  recordingState: "ready" | "pending" | "failed" | "purged" | "none";
  recordingUrl?: string;
  threadId?: string;
  /** The note this call left on its thread (a call_summary message): the thread draws the call there. */
  messageId?: string;
  direction: "inbound" | "outbound";
  /** It never connected. */
  missed: boolean;
  /** What the call was about: what the caller wanted, in the analysis's plain words, or the provider's first sentence.
   *  Null when it never connected or nothing was said about it -- never a sentence saying there is no sentence. */
  about: string | null;
  /** How it went, a few words each: how the caller sounded, how it ended, why there is no recording to play. The call
   *  card's one quiet line. */
  facts: string[];
}

/** A call's length in words, the way the product says it everywhere: "2 min 5 sec", "6 sec". */
export function spokenDuration(ms: number | null): string {
  if (!ms) return "Duration not recorded";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m ? `${m} min ${sec} sec` : `${sec} sec`;
}

// How the caller sounded, as the voice provider read it, where that says anything: "Neutral" and "Unknown" do not.
const CALL_MOOD: Record<string, string> = { Positive: "Sounded positive", Negative: "Sounded negative" };
// Why a call has no recording to play. A call never recorded says so: said nothing, it looked like a player that failed
// to draw (Emily's call, which is filler and was never a call at all).
const RECORDING_NOTE: Partial<Record<CallVM["recordingState"], string>> = {
  none: "No recording",
  pending: "Recording still processing",
  failed: "Recording couldn't be saved",
  purged: `Recording removed after ${RECORDING_RETENTION_DAYS} days`,
};

export function toCallVM(dto: CallDto, tz: string, now = new Date()): CallVM {
  const withheld = !dto.from_e164 && !dto.from_raw;
  const name = dto.contact?.display_name || dto.contact?.wa_profile_name || null;
  const who = callerName(dto);
  const whoShort = name ? (isIdentifierName(name) ? name : name.split(" ")[0]) : "Caller";
  const dur = callLength(dto.duration_ms);
  // Not `status === "ongoing"`. A lost call_ended leaves that flag set forever,
  // and this viewmodel is what the Live surface would render from.
  const live = isLiveCall(dto, now);
  // Retell's not_connected: the dial never connected. An attempt, not a call.
  const missed = dto.status === "not_connected";
  // What the caller wanted, in the analysis's plain words, leads; the
  // provider's own summary is the fallback, its opening folded.
  const wanted = (dto.wanted || "").trim();
  const headSummary = tidyCallSummary(dto.summary) ?? "";
  const firstSentence = headSummary ? (headSummary.split(/(?<=[.!?])\s/)[0] ?? headSummary) : "";

  const bullets: string[] = [
    `${dto.direction === "inbound" ? "Inbound" : "Outbound"} · ${missed ? "never connected" : spokenDuration(dto.duration_ms)}`,
  ];
  const ending = dto.disconnection_reason
    ? (DISCONNECTION_LABELS[dto.disconnection_reason] ?? dto.disconnection_reason.replace(/_/g, " "))
    : null;
  if (ending) bullets.push(`Ended: ${ending}`);
  if (dto.sentiment) {
    bullets.push(`Caller sentiment: ${dto.sentiment} — the voice provider's own read`);
  }
  const outcomeWords = callOutcomeWords(dto.outcome);
  if (outcomeWords) bullets.push(outcomeWords);
  if (dto.follow_up?.trim()) bullets.push(`To do: ${dto.follow_up.trim()}`);
  if (dto.caller_name?.trim()) bullets.push(`Gave their name as ${dto.caller_name.trim()}`);
  if (dto.caller_email) bullets.push(`Gave their email as ${dto.caller_email}`);
  // "purged": the audio was removed on the schedule the privacy page states
  // (retention.ts); the row keeps the transcript. Said so, rather than left to
  // read as "still processing" for ever.
  const recState: CallVM["recordingState"] =
    dto.recording?.fetch_state === "stored"
      ? "ready"
      : dto.recording?.fetch_state === "failed"
        ? "failed"
        : dto.recording?.fetch_state === "purged"
          ? "purged"
          : dto.recording
            ? "pending"
            : "none";
  if (!missed) {
    bullets.push(
      recState === "ready"
        ? "Recording saved"
        : recState === "pending"
          ? "Recording still processing"
          : recState === "failed"
            ? "Recording couldn't be saved from the voice provider"
            : recState === "purged"
              ? RECORDING_PURGED_WORDS
              : "No recording for this call",
    );
  }
  if (dto.message_id && !withheld) bullets.push(`Noted on ${whoShort}'s thread in the Inbox`);

  // Each line's moment in the call, in seconds: the provider's own start, or halfway between its neighbours for a line
  // it gave none (two of the salon's 244 real lines, short replies with no words); its end, or where the next line
  // begins. A whisper -- an injected turn, the owner's own words to the receptionist -- is not a sound in the recording,
  // so it has no moment.
  const turns = dto.transcript_object ?? [];
  const given = turns.map((turn) => (turn.role === "injected" ? null : (turn.start ?? turn.words?.[0]?.start ?? null)));
  const starts = given.map((s, i) => {
    if (s != null || turns[i].role === "injected") return s;
    const before =
      given
        .slice(0, i)
        .reverse()
        .find((x) => x != null) ?? null;
    const after = given.slice(i + 1).find((x) => x != null) ?? null;
    return before != null && after != null ? (before + after) / 2 : (before ?? after);
  });
  const transcript = turns.map((turn, i) => {
    // An injected turn is a whisper: the owner's own words, shown as theirs.
    if (turn.role === "injected") {
      return { t: "—", speaker: "whisper" as const, text: whisperText(turn.content), start: null, end: null };
    }
    const own = given[i];
    const start = starts[i];
    const next = start == null ? null : (starts.slice(i + 1).find((x) => x != null && x > start) ?? null);
    const end = start == null ? null : (turn.end ?? turn.words?.[turn.words.length - 1]?.end ?? next);
    return {
      t: typeof own === "number" ? `${Math.floor(own / 60)}:${String(Math.floor(own % 60)).padStart(2, "0")}` : "—",
      speaker: (turn.role === "agent" ? "agent" : "client") as "agent" | "client",
      text: turn.content ?? "",
      start,
      end,
    };
  });

  const snippetBody = missed
    ? "The call never connected."
    : wanted || firstSentence || (dto.in_voicemail ? "Reached voicemail." : "No summary from this call.");
  return {
    id: `cv-${dto.id}`,
    real: true,
    callId: dto.id,
    who,
    whoShort,
    initials: withheld ? "–" : initialsOf(who),
    clientId: dto.contact_id,
    channel: "phone",
    agent: { glyph: "P", name: "Phone Receptionist" },
    at: shortTime(dto.started_at, tz, now),
    ts: dto.started_at ? new Date(dto.started_at).getTime() : 0,
    ...(dur ? { duration: dur } : {}),
    outcome: live
      ? "live"
      : missed
        ? "missed"
        : abandonedCall(dto)
          ? "abandoned"
          : callOutcomeOf(dto.outcome) === "callback_needed"
            ? "callback"
            : "handled",
    ...(live ? { live: true } : {}),
    snippet: withheld
      ? `${dto.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` · ${dur}` : ""} — caller ID withheld, so this call isn't linked to a customer.`
      : `${dto.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` · ${dur}` : ""} — ${snippetBody}`,
    summary: { headline: wanted || firstSentence || snippetBody, bullets },
    transcript,
    durationSec: dto.duration_ms ? Math.round(dto.duration_ms / 1000) : null,
    recordingState: recState,
    ...(recState === "ready" ? { recordingUrl: `/api/v1/calls/${dto.id}/recording` } : {}),
    ...(dto.conversation_id ? { threadId: `th-${dto.conversation_id}` } : {}),
    // The call's facts as facts, for the thread's call card: they were only inside the bullets' sentences.
    ...(dto.message_id ? { messageId: dto.message_id } : {}),
    direction: dto.direction === "outbound" ? "outbound" : "inbound",
    missed,
    // A voicemail says so in how it ended; "Reached voicemail." here said it twice.
    about: missed ? null : wanted || firstSentence || null,
    facts: [CALL_MOOD[dto.sentiment ?? ""], ending, missed ? undefined : RECORDING_NOTE[recState]].filter(
      (f): f is string => !!f,
    ),
  };
}
