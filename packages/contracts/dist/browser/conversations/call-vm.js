import { callLength, mmss } from "../shared/clock.js";
import { whisperText } from "../voice/whisper.js";
import { callerName } from "../people/person-name.js";
import { isOptedOutContact } from "../consent/consent.js";
import { isLiveCall } from "../config/policy.js";
import { callNotesOf, callOutcomeOf, callOutcomeWords, tidyCallSummary } from "../voice/call-words.js";
import { RECORDING_PURGED_WORDS, RECORDING_RETENTION_DAYS } from "../workspace/retention.js";
import { initialsOf, shortName } from "./thread-contact.js";
import { shortTime } from "./thread-clock.js";
import {
  CALL_OUTCOME_WORDS,
  abandonedCall,
  callAttemptWords,
  endedHowOf,
  neverConnected,
  reachedVoicemail,
  recordingStateOf
} from "./call-dto.js";
export function callOutcomeFor(dto, live) {
  if (live) return "live";
  if (neverConnected(dto)) return "missed";
  if (dto.status === "error") return "failed";
  if (abandonedCall(dto)) return "abandoned";
  if (callOutcomeOf(dto.outcome) === "callback_needed") return "callback";
  return reachedVoicemail(dto) ? "voicemail" : "handled";
}
function transcriptOf(turns) {
  const given = turns.map((turn) => turn.role === "injected" ? null : turn.start ?? turn.words?.[0]?.start ?? null);
  const starts = given.map((s, i) => {
    if (s != null || turns[i].role === "injected") return s;
    const before = given.slice(0, i).reverse().find((x) => x != null) ?? null;
    const after = given.slice(i + 1).find((x) => x != null) ?? null;
    return before != null && after != null ? (before + after) / 2 : before ?? after;
  });
  return turns.map((turn, i) => {
    if (turn.role === "injected") {
      return { t: "\u2014", speaker: "whisper", text: whisperText(turn.content), start: null, end: null };
    }
    const own = given[i];
    const start = starts[i];
    const next = start == null ? null : starts.slice(i + 1).find((x) => x != null && x > start) ?? null;
    const end = start == null ? null : turn.end ?? turn.words?.[turn.words.length - 1]?.end ?? next;
    return {
      t: typeof own === "number" ? mmss(own * 1e3) : "\u2014",
      speaker: turn.role === "agent" ? "agent" : "client",
      text: turn.content ?? "",
      start,
      end
    };
  });
}
export function spokenDuration(ms) {
  if (!ms) return "Duration not recorded";
  const total = Math.round(ms / 1e3);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return m ? `${m} min ${sec} sec` : `${sec} sec`;
}
const CALL_MOOD = { Positive: "Sounded positive", Negative: "Sounded negative" };
const RECORDING_NOTE = {
  none: "No recording",
  pending: "Recording still processing",
  failed: "Recording couldn't be saved",
  purged: `Recording removed after ${RECORDING_RETENTION_DAYS} days`
};
export function toCallVM(dto, tz, now = /* @__PURE__ */ new Date()) {
  const withheld = !dto.from_e164 && !dto.from_raw;
  const name = dto.contact?.display_name || dto.contact?.wa_profile_name || null;
  const who = callerName(dto);
  const whoShort = name ? shortName(name) : "Caller";
  const dur = callLength(dto.duration_ms);
  const live = isLiveCall(dto, now);
  const missed = neverConnected(dto);
  const wanted = (dto.wanted || "").trim();
  const headSummary = tidyCallSummary(dto.summary) ?? "";
  const firstSentence = headSummary ? headSummary.split(/(?<=[.!?])\s/)[0] ?? headSummary : "";
  const bullets = [
    `${dto.direction === "inbound" ? "Inbound" : "Outbound"} \xB7 ${missed ? "never connected" : spokenDuration(dto.duration_ms)}`
  ];
  const ending = endedHowOf(dto);
  if (ending) bullets.push(`Ended: ${ending}`);
  if (dto.sentiment) {
    bullets.push(`Caller sentiment: ${dto.sentiment} \u2014 the voice provider's own read`);
  }
  const outcomeWords = callOutcomeWords(dto.outcome);
  if (outcomeWords) bullets.push(outcomeWords);
  const notes = callNotesOf(dto);
  if (notes.todo) bullets.push(notes.todo);
  bullets.push(...notes.gave);
  const recState = recordingStateOf(dto);
  if (!missed) {
    bullets.push(
      recState === "ready" ? "Recording saved" : recState === "pending" ? "Recording still processing" : recState === "failed" ? "Recording couldn't be saved from the voice provider" : recState === "purged" ? RECORDING_PURGED_WORDS : "No recording for this call"
    );
  }
  if (dto.message_id && !withheld) bullets.push(`Noted on ${whoShort}'s thread in the Inbox`);
  const transcript = transcriptOf(dto.transcript_object ?? []);
  const snippetBody = missed ? "The call never connected." : wanted || firstSentence || (reachedVoicemail(dto) ? "Reached voicemail." : "No summary from this call.");
  return {
    id: `cv-${dto.id}`,
    real: true,
    callId: dto.id,
    who,
    whoShort,
    initials: withheld ? "\u2013" : initialsOf(who),
    stopped: isOptedOutContact(dto.contact),
    clientId: dto.contact_id,
    channel: "phone",
    agent: { glyph: "P", name: "Phone Receptionist" },
    at: shortTime(dto.started_at, tz, now),
    ts: dto.started_at ? new Date(dto.started_at).getTime() : 0,
    ...dur ? { duration: dur } : {},
    outcome: callOutcomeFor(dto, live),
    ...live ? { live: true } : {},
    snippet: withheld ? `${dto.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` \xB7 ${dur}` : ""} \u2014 caller ID withheld, so this call isn't linked to a customer.` : `${dto.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` \xB7 ${dur}` : ""} \u2014 ${snippetBody}`,
    summary: { headline: wanted || firstSentence || snippetBody, bullets },
    transcript,
    durationSec: dto.duration_ms ? Math.round(dto.duration_ms / 1e3) : null,
    recordingState: recState,
    ...recState === "ready" ? { recordingUrl: `/api/v1/calls/${dto.id}/recording` } : {},
    ...dto.conversation_id ? { threadId: `th-${dto.conversation_id}` } : {},
    // The call's facts as facts, for the thread's call card: they were only inside the bullets' sentences.
    ...dto.message_id ? { messageId: dto.message_id } : {},
    direction: dto.direction === "outbound" ? "outbound" : "inbound",
    missed,
    // A voicemail says so in how it ended; "Reached voicemail." here said it twice.
    about: missed ? null : wanted || firstSentence || null,
    facts: [CALL_MOOD[dto.sentiment ?? ""], ending, missed ? void 0 : RECORDING_NOTE[recState]].filter(
      (f) => !!f
    ),
    notes
  };
}
export function callEndedWords(dto, now = /* @__PURE__ */ new Date()) {
  const outcome = callOutcomeFor(dto, isLiveCall(dto, now));
  return outcome === "missed" ? callAttemptWords(dto.direction === "outbound" ? "outbound" : "inbound") : CALL_OUTCOME_WORDS[outcome];
}
