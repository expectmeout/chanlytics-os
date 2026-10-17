/**
 * A call's row and transcript (`toCallVM`), and a call's length in words. The call as the wire gives it, and
 * how it ended, is call-dto.ts; the caller's name and the times come from thread-contact.ts and thread-clock.ts.
 */
import { callLength, mmss } from "../shared/clock";
import { whisperText } from "../voice/whisper";
import { callerName } from "../people/person-name";
import { isOptedOutContact } from "../consent/consent";
import { isLiveCall } from "../config/policy";
import { callNotesOf, callOutcomeOf, callOutcomeWords, tidyCallSummary, type CallNotes } from "../voice/call-words";
import { RECORDING_PURGED_WORDS, RECORDING_RETENTION_DAYS } from "../workspace/retention";
import { initialsOf, shortName } from "./thread-contact";
import { shortTime } from "./thread-clock";
import {
  CALL_OUTCOME_WORDS,
  abandonedCall,
  callAttemptWords,
  endedHowOf,
  missedCall,
  neverConnected,
  reachedVoicemail,
  recordingStateOf,
  type CallDto,
  type CallOutcome,
  type RecordingState,
} from "./call-dto";

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
  /** The caller is a person who asked to stop, or is on do-not-contact (isOptedOutContact): the row says it beside the name. A caller nobody knows is not. */
  stopped: boolean;
  clientId: string | null;
  channel: "phone";
  agent: { glyph: string; name: string };
  at: string;
  duration?: string;
  ts: number;
  /** live: in progress under the heartbeat rule · missed: the dial never connected (Retell's not_connected) ·
   *  failed: the provider could not place or keep it (status error) · abandoned · callback · voicemail: they
   *  reached the voicemail · handled: everything else. A voicemail and an errored call read "Receptionist
   *  handled it" until the 2 Oct 2026 audit. */
  outcome: CallOutcome;
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
  recordingState: RecordingState;
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
  /** What the call's analysis left beyond what the caller wanted: the to-do the receptionist noted, and the name and
   *  address the caller gave -- what the row holds, in the words every surface says them in (callNotesOf). The call
   *  card draws them, and the person's page beside the call in their history. */
  notes: CallNotes;
}

/**
 * How a call ended, by the one ladder every call surface reads: in progress (the caller's heartbeat rule, `live`), the
 * dial never connected, the provider could not place or keep it, the caller hung up with nothing, they asked for a call
 * back, they reached the voicemail, else handled. Conversations' pill and Live's both read it; a voicemail and an errored
 * call read "Receptionist handled it" before the 2 Oct 2026 audit, and Live had no abandoned or call-back at all.
 */
export function callOutcomeFor(
  dto: Pick<CallDto, "direction" | "status" | "duration_ms" | "disconnection_reason" | "in_voicemail" | "outcome">,
  live: boolean,
): CallVM["outcome"] {
  if (live) return "live";
  if (neverConnected(dto)) return "missed";
  if (dto.status === "error") return "failed";
  if (abandonedCall(dto)) return "abandoned";
  if (callOutcomeOf(dto.outcome) === "callback_needed") return "callback";
  return reachedVoicemail(dto) ? "voicemail" : "handled";
}

/**
 * A call's turns as the card draws them. Each line's moment in the call, in seconds: the provider's own start, or halfway
 * between its neighbours for a line it gave none (two of the salon's 244 real lines, short replies with no words); its end,
 * or where the next line begins. A whisper -- an injected turn, the owner's own words to the receptionist -- is not a sound
 * in the recording, so it has no moment.
 */
function transcriptOf(turns: NonNullable<CallDto["transcript_object"]>): CallVM["transcript"] {
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
  return turns.map((turn, i) => {
    // An injected turn is a whisper: the owner's own words, shown as theirs.
    if (turn.role === "injected") {
      return { t: "—", speaker: "whisper" as const, text: whisperText(turn.content), start: null, end: null };
    }
    const own = given[i];
    const start = starts[i];
    const next = start == null ? null : (starts.slice(i + 1).find((x) => x != null && x > start) ?? null);
    const end = start == null ? null : (turn.end ?? turn.words?.[turn.words.length - 1]?.end ?? next);
    return {
      t: typeof own === "number" ? mmss(own * 1000) : "—",
      speaker: (turn.role === "agent" ? "agent" : "client") as "agent" | "client",
      text: turn.content ?? "",
      start,
      end,
    };
  });
}

/** A call's length in words, the way the product says it everywhere: "2 min 5 sec", "6 sec". */
export function spokenDuration(ms: number | null): string {
  if (!ms) return "Duration not recorded";
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m ? `${m} min ${sec} sec` : `${sec} sec`;
}

/**
 * What a person is asked to do about a customer's call that reached no answer, or null for any other call: one that
 * never connected (a missed call) and one they left without a word (abandonedCall) each open the thread's `callback`
 * hold, which a call back to them closes (00422). The first was a bell for a day and the second a Today row for a day,
 * and neither said the caller was still owed a call (the closed-loop audit of 17 Oct 2026, C).
 */
export function unansweredCallTodo(
  dto: Pick<CallDto, "direction" | "status" | "duration_ms" | "disconnection_reason" | "in_voicemail" | "outcome"> & {
    transcript_object?: CallDto["transcript_object"];
  },
): string | null {
  if (missedCall({ missed: neverConnected(dto), direction: dto.direction })) {
    return "Missed call: it rang and never connected. Call them back.";
  }
  if (abandonedCall(dto)) {
    return `Hung up after ${spokenDuration(dto.duration_ms)} without a word. Call them back.`;
  }
  return null;
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
  const whoShort = name ? shortName(name) : "Caller";
  const dur = callLength(dto.duration_ms);
  // Not `status === "ongoing"`. A lost call_ended leaves that flag set forever,
  // and this viewmodel is what the Live surface would render from.
  const live = isLiveCall(dto, now);
  const missed = neverConnected(dto);
  // What the caller wanted, in the analysis's plain words, leads; the
  // provider's own summary is the fallback, its opening folded.
  const wanted = (dto.wanted || "").trim();
  const headSummary = tidyCallSummary(dto.summary) ?? "";
  const firstSentence = headSummary ? (headSummary.split(/(?<=[.!?])\s/)[0] ?? headSummary) : "";

  const bullets: string[] = [
    `${dto.direction === "inbound" ? "Inbound" : "Outbound"} · ${missed ? "never connected" : spokenDuration(dto.duration_ms)}`,
  ];
  const ending = endedHowOf(dto);
  if (ending) bullets.push(`Ended: ${ending}`);
  if (dto.sentiment) {
    bullets.push(`Caller sentiment: ${dto.sentiment} — the voice provider's own read`);
  }
  const outcomeWords = callOutcomeWords(dto.outcome);
  if (outcomeWords) bullets.push(outcomeWords);
  const notes = callNotesOf(dto);
  if (notes.todo) bullets.push(notes.todo);
  bullets.push(...notes.gave);
  // "purged": the audio was removed on the schedule the privacy page states
  // (retention.ts); the row keeps the transcript. Said so, rather than left to
  // read as "still processing" for ever.
  const recState = recordingStateOf(dto);
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

  const transcript = transcriptOf(dto.transcript_object ?? []);

  const snippetBody = missed
    ? "The call never connected."
    : wanted || firstSentence || (reachedVoicemail(dto) ? "Reached voicemail." : "No summary from this call.");
  return {
    id: `cv-${dto.id}`,
    real: true,
    callId: dto.id,
    who,
    whoShort,
    initials: withheld ? "–" : initialsOf(who),
    stopped: isOptedOutContact(dto.contact),
    clientId: dto.contact_id,
    channel: "phone",
    agent: { glyph: "P", name: "Phone Receptionist" },
    at: shortTime(dto.started_at, tz, now),
    ts: dto.started_at ? new Date(dto.started_at).getTime() : 0,
    ...(dur ? { duration: dur } : {}),
    outcome: callOutcomeFor(dto, live),
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
    notes,
  };
}

/**
 * How a call ended, in the one word the pages say it with (CALL_OUTCOME_WORDS over callOutcomeFor, as a person's History
 * says it), a dial that never connected by who dialled it (callAttemptWords): "Call didn't connect" for one the
 * receptionist placed, "Missed call" for a customer's. Ask's reads said the stored status ("not_connected") where the
 * pages say the word (the wiring's second audit, R13 X5-7).
 */
export function callEndedWords(
  dto: Pick<
    CallDto,
    | "direction"
    | "status"
    | "duration_ms"
    | "disconnection_reason"
    | "in_voicemail"
    | "outcome"
    | "updated_at"
    | "started_at"
  >,
  now = new Date(),
): string {
  const outcome = callOutcomeFor(dto, isLiveCall(dto, now));
  return outcome === "missed"
    ? callAttemptWords(dto.direction === "outbound" ? "outbound" : "inbound")
    : CALL_OUTCOME_WORDS[outcome];
}
