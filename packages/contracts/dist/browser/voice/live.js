import { injectedTurn } from "./whisper.js";
import { CALL_HEARTBEAT_MS, isLiveCall } from "../config/policy.js";
import { formatPhoneDisplay } from "../shared/phone.js";
import { callLength, mmss } from "../shared/clock.js";
import { callerName } from "../people/person-name.js";
import { isOptedOutContact, mayRing } from "../consent/consent.js";
import {
  endedHowOf,
  neverConnected,
  recordingStateOf
} from "../conversations/call-dto.js";
import { callOutcomeFor, spokenDuration } from "../conversations/call-vm.js";
import { initialsOf, shortName } from "../conversations/thread-contact.js";
import { shortTime } from "../conversations/thread-clock.js";
import { callNotesOf, callOutcomeWords } from "./call-words.js";
import { PHONE_LINE_OFF } from "../lines/caller-gets.js";
import { DAY_MS, MIN_MS } from "../shared/time.js";
export const LIVE_STALE_MS = 5 * MIN_MS;
export const LIVE_OVERLONG_MS = 30 * MIN_MS;
export const ANALYSIS_GRACE_MS = 10 * MIN_MS;
export const RECENT_MAX = 8;
const MISSED_CALL_NEWS_MS = DAY_MS;
const callerMarks = (contact) => ({
  stopped: isOptedOutContact(contact),
  dnc: !mayRing(contact)
});
export function missedCallIsNews(c, now) {
  return c.missed && !c.live && typeof c.startedAtMs === "number" && now - c.startedAtMs <= MISSED_CALL_NEWS_MS;
}
export function fmtClock(seconds) {
  return mmss(Math.max(0, seconds) * 1e3);
}
export function liveStillUp(c, heartbeatMs, nowMs) {
  if (!c.live) return false;
  return nowMs - (c.heartbeatAtMs ?? c.startedAtMs ?? 0) < heartbeatMs;
}
export function callsStillUp(read, nowMs) {
  return (read?.now ?? []).filter((c) => liveStillUp(c, read?.heartbeatMs ?? 0, nowMs));
}
export function liveBar(vm, nowMs) {
  const up = callsStillUp(vm, nowMs);
  if (up.length === 0) return null;
  if (up.length > 1) {
    return {
      callId: null,
      text: `${up.length} calls on your line now`,
      sinceMs: null,
      checking: up.some((c2) => c2.checking)
    };
  }
  const c = up[0];
  return {
    callId: c.callId,
    text: `On the phone now \xB7 ${c.whoShort}`,
    // A call whose provider has gone quiet gets no running clock: the number
    // would keep climbing for something that may already have ended.
    sinceMs: c.checking || c.startedAtMs === null ? null : Math.max(0, nowMs - c.startedAtMs),
    checking: c.checking
  };
}
function turnsOf(dto) {
  return (dto.transcript_object ?? []).filter((turn) => turn.role === "agent" || turn.role === "user" || turn.role === "injected").map((turn) => {
    const start = turn.start ?? turn.words?.[0]?.start;
    if (turn.role === "injected") {
      const said = injectedTurn(turn.content);
      return { speaker: said.speaker, text: said.text, t: "\u2014" };
    }
    return {
      speaker: turn.role === "agent" ? "agent" : "client",
      text: turn.content ?? "",
      t: typeof start === "number" ? mmss(start * 1e3) : "\u2014"
    };
  });
}
function checkingOf(live, startedAtMs, heartbeatAtMs, nowMs) {
  if (!live) return { checking: false, checkingWhy: null };
  const sinceBeat = heartbeatAtMs === null ? 0 : nowMs - heartbeatAtMs;
  const sinceStart = startedAtMs === null ? 0 : nowMs - startedAtMs;
  if (sinceBeat > LIVE_STALE_MS) {
    return {
      checking: true,
      checkingWhy: `no word from the phone provider for ${Math.round(sinceBeat / MIN_MS)} minutes`
    };
  }
  if (sinceStart > LIVE_OVERLONG_MS) {
    return { checking: true, checkingWhy: `live for over ${Math.floor(sinceStart / MIN_MS)} minutes` };
  }
  return { checking: false, checkingWhy: null };
}
function summaryStateOf(c) {
  if (c.missed) return "missed";
  if (c.summary) return "ready";
  return c.live || c.endedMs !== null && c.nowMs - c.endedMs < ANALYSIS_GRACE_MS ? "pending" : "none";
}
function turnsAndLastOf(dto) {
  const transcript = turnsOf(dto);
  const said = [...transcript].reverse().find((t) => t.speaker === "client" && t.text);
  return { transcript, saidLast: said ? said.text : dto.said_last ?? null };
}
export function toLiveCallVM(dto, tz, now = /* @__PURE__ */ new Date()) {
  const nowMs = now.getTime();
  const withheld = !dto.from_e164 && !dto.from_raw;
  const phone = formatPhoneDisplay(dto.from_e164);
  const name = dto.contact?.display_name || dto.contact?.wa_profile_name || null;
  const who = callerName(dto);
  const whoShort = name ? shortName(name) : "the caller";
  const live = isLiveCall(dto, now);
  const missed = neverConnected(dto);
  const startedAtMs = dto.started_at ? new Date(dto.started_at).getTime() : null;
  const beat = dto.updated_at ?? dto.started_at;
  const heartbeatAtMs = beat ? new Date(beat).getTime() : null;
  const { checking, checkingWhy } = checkingOf(live, startedAtMs, heartbeatAtMs, nowMs);
  const endedMs = dto.ended_at ? new Date(dto.ended_at).getTime() : null;
  const summary = (dto.summary ?? "").trim() || null;
  const summaryState = summaryStateOf({ missed, summary, live, endedMs, nowMs });
  return {
    callId: dto.id,
    cvId: `cv-${dto.id}`,
    clientId: dto.contact_id,
    who,
    whoShort,
    initials: withheld ? "\u2013" : initialsOf(who),
    ...callerMarks(dto.contact),
    // The CUSTOMER's number: on a call the receptionist placed, that is the one it dialled. The bell's missed-call
    // row named the business's own line under an outbound dial that never connected (the 2 Oct 2026 audit).
    number: withheld ? null : dto.direction === "outbound" ? formatPhoneDisplay(dto.to_e164) : phone ?? dto.from_raw,
    from: withheld ? null : dto.from_e164,
    direction: dto.direction,
    status: dto.status,
    live,
    missed,
    outcome: callOutcomeFor(dto, live),
    stale: dto.status === "ongoing" && !live,
    checking,
    checkingWhy,
    startedAtMs,
    heartbeatAtMs,
    startedLabel: shortTime(dto.started_at, tz, now),
    duration: live || missed ? null : callLength(dto.duration_ms) ?? null,
    summaryState,
    summary,
    sentiment: dto.sentiment,
    endedHow: endedHowOf(dto),
    recordingState: recordingStateOf(dto),
    // The analysis's words, as toCallVM reads them; none while the call is still on the line.
    wanted: live ? null : dto.wanted?.trim() || null,
    outcomeWords: live ? null : callOutcomeWords(dto.outcome),
    notes: live ? { todo: null, gave: [] } : callNotesOf(dto),
    lengthWords: live || missed || !callLength(dto.duration_ms) ? null : spokenDuration(dto.duration_ms),
    ...turnsAndLastOf(dto)
  };
}
export function toLiveVM(calls, channels, tz, now = /* @__PURE__ */ new Date()) {
  const vms = calls.map((c) => toLiveCallVM(c, tz, now));
  const nowList = vms.filter((c) => c.live).sort((a, b) => (a.startedAtMs ?? 0) - (b.startedAtMs ?? 0));
  const finished = vms.filter((c) => !c.live).sort((a, b) => (b.startedAtMs ?? 0) - (a.startedAtMs ?? 0));
  const recent = finished.slice(0, RECENT_MAX);
  const missedCalls = finished.filter((c) => missedCallIsNews(c, now.getTime()));
  const voice = channels?.find((ch) => ch.kind === "voice") ?? null;
  const line = voice ? {
    number: formatPhoneDisplay(voice.number_e164),
    on: voice.status === "active",
    offWords: `The line is switched off \u2014 ${PHONE_LINE_OFF.gets}.`,
    lastCallLabel: voice.last_inbound_at ? shortTime(voice.last_inbound_at, tz, now) : null
  } : null;
  return {
    now: nowList,
    recent,
    missedCalls,
    line,
    lineRead: channels !== null,
    heartbeatMs: CALL_HEARTBEAT_MS,
    fetchedAtMs: now.getTime()
  };
}
