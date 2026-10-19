/**
 * Calls right now — the phone line at this moment, as facts.
 *
 * The mockup's Live monitor promised Live Listen, Take Over and End Call over
 * an invented caller. The phone provider offers none of those for a hosted
 * agent. What it does give us is enough for an honest page: which calls are
 * up (under the heartbeat rule, never the status flag alone), when each
 * started (so a clock can run from the real start), the transcript turns
 * when the agent is configured to send them, and — the moment a call ends —
 * the summary as it arrives.
 *
 * Everything here is derived from columns. The page runs its own clock from
 * `startedAtMs` and re-applies the heartbeat rule between refreshes with
 * `heartbeatMs`, so a call nobody has heard from leaves the list even before
 * the next fetch says so.
 */
import { injectedTurn } from "./whisper";
import { CALL_HEARTBEAT_MS, isLiveCall } from "../config/policy";
import { formatPhoneDisplay } from "../shared/phone";
import { callLength, mmss } from "../shared/clock";
import { callerName } from "../people/person-name";
import { isOptedOutContact, mayRing } from "../consent/consent";
import {
  endedHowOf,
  neverConnected,
  recordingStateOf,
  type CallDto,
  type RecordingState,
} from "../conversations/call-dto";
import { callOutcomeFor, spokenDuration, type CallVM } from "../conversations/call-vm";
import { initialsOf, shortName } from "../conversations/thread-contact";
import { shortTime } from "../conversations/thread-clock";
import { callNotesOf, callOutcomeWords, type CallNotes } from "./call-words";
import { PHONE_LINE_OFF } from "../lines/caller-gets";
import type { ChannelDto } from "../lines/channels";
import { DAY_MS, MIN_MS } from "../shared/time";

/** A live call whose heartbeat is older than this is "still marked live · checking". */
export const LIVE_STALE_MS = 5 * MIN_MS;
/** A call live longer than this is flagged the same way: long calls happen, rarely. */
export const LIVE_OVERLONG_MS = 30 * MIN_MS;
/** Retell's analysis lands a little after call_ended; until then "no summary"
 *  is a fact about the clock, not the call. */
export const ANALYSIS_GRACE_MS = 10 * MIN_MS;
/** How many finished calls the page lists beside the live ones. */
export const RECENT_MAX = 8;
/** How long a dial that never connected stays news to the bell (missedCallIsNews): a day. */
const MISSED_CALL_NEWS_MS = DAY_MS;

/** The caller's marks: a stop beside their name (isOptedOutContact), and do-not-contact, which keeps their number unrung. */
const callerMarks = (contact: Parameters<typeof isOptedOutContact>[0]): Pick<LiveCallVM, "stopped" | "dnc"> => ({
  stopped: isOptedOutContact(contact),
  dnc: !mayRing(contact),
});

/**
 * Whether a call is one the bell still raises a "missed call" row for: a dial that never connected, no longer on the
 * line, with a start, inside MISSED_CALL_NEWS_MS of `now`. One rule, and two readers: the feed asks it of every call
 * it is handed (today/notifications.ts), and Live carries every call that passes it (LiveVM.missedCalls), so what the
 * bell can see is not the page's newest RECENT_MAX.
 */
export function missedCallIsNews<C extends Pick<LiveCallVM, "missed" | "live" | "startedAtMs">>(
  c: C,
  now: number,
): c is C & { startedAtMs: number } {
  return c.missed && !c.live && typeof c.startedAtMs === "number" && now - c.startedAtMs <= MISSED_CALL_NEWS_MS;
}

export interface LiveTurnVM {
  /** "whisper" is the owner's own words, handed to the agent mid-call; "platform" is what Chanlytics told it -- a correction, or the hand-over. */
  speaker: "agent" | "client" | "whisper" | "platform";
  text: string;
  /** "0:42" from the provider's word timings, or "—". */
  t: string;
}

export interface LiveCallVM {
  callId: string;
  /** The call's row in Conversations. */
  cvId: string;
  clientId: string | null;
  who: string;
  whoShort: string;
  initials: string;
  /** The caller is a person who asked to stop, or is on do-not-contact (isOptedOutContact): the row says it beside the name. */
  stopped: boolean;
  /** Of those, on do-not-contact: their number is shown, never offered to ring (consent mayRing). */
  dnc: boolean;
  /** Display phone, or null when the caller ID was withheld. */
  number: string | null;
  /** The caller's number as stored (E.164), for a page that acts on it (the first run's transfer choice); null when withheld. */
  from: string | null;
  direction: "inbound" | "outbound";
  status: string;
  /** In progress under the heartbeat rule. */
  live: boolean;
  /** Retell's not_connected: the dial never connected. */
  missed: boolean;
  /** How it ended, by the ladder Conversations reads (callOutcomeFor): the pill's word for a call that is over. */
  outcome: CallVM["outcome"];
  /** Marked ongoing by the provider but silent past the heartbeat: the
   *  reconcile sweep will settle it; until then it is neither live nor
   *  ended, and the page must not call it either. */
  stale: boolean;
  /** Live, but the heartbeat is older than LIVE_STALE_MS or the call has run
   *  past LIVE_OVERLONG_MS: shown as "still marked live · checking". */
  checking: boolean;
  checkingWhy: string | null;
  startedAtMs: number | null;
  /** The last time the provider told us anything about this call. */
  heartbeatAtMs: number | null;
  /** "2:14 PM" today, "Aug 26" otherwise. */
  startedLabel: string;
  /** mm:ss once the call has ended, by the call card's rule (callLength); null while live (the page runs its own
   *  clock), for a dial that never connected, and for a call with no length. */
  duration: string | null;
  summaryState: "ready" | "pending" | "none" | "missed";
  summary: string | null;
  sentiment: string | null;
  /** Why the call ended, in the owner's words. */
  endedHow: string | null;
  recordingState: RecordingState;
  /** What the caller wanted, in the post-call analysis's plain words; null while live or without an analysis. */
  wanted: string | null;
  /** How it ended, in the owner's words (callOutcomeWords); null without an analysis outcome. */
  outcomeWords: string | null;
  /** What the analysis left beyond what they wanted, as the call row says it (callNotesOf): the to-do the receptionist
   *  noted, and the name and address the caller gave. None while the call is on the line. */
  notes: CallNotes;
  /** "3 min 10 sec" once the call has ended: a length in words, so it never reads as a time beside a date. */
  lengthWords: string | null;
  transcript: LiveTurnVM[];
  /** The last thing the caller said: the last of their turns, or what a list's ended call carries in their place
   *  (CallDto.said_last). Live's row says it under the name. */
  saidLast: string | null;
}

export interface LiveLineVM {
  number: string | null;
  on: boolean;
  /** What the page says while the line is off: the sentence about a switched-off line, whole, with what a caller gets
   *  (lines/caller-gets.ts). The page draws it when `on` is false and says nothing of its own about the receptionist. */
  offWords: string;
  /** When the line last rang, in the same short form. */
  lastCallLabel: string | null;
}

export interface LiveVM {
  /** In progress, oldest first — the one that has been waiting longest leads. */
  now: LiveCallVM[];
  /** Finished or missed, newest first, at most RECENT_MAX: the page's list. */
  recent: LiveCallVM[];
  /** Every call that passes missedCallIsNews as of the read, newest first, with no cap: what the bell raises a row for. A busy
   *  day's eight newest finished calls need not include the missed one from the morning. */
  missedCalls: LiveCallVM[];
  /** The voice channel, or null when the workspace has no phone line. */
  line: LiveLineVM | null;
  /** Whether the channels read succeeded; false means the line's state is unknown, not absent. */
  lineRead: boolean;
  heartbeatMs: number;
  fetchedAtMs: number;
}

/** Seconds → "m:ss", the page's clock format. */
export function fmtClock(seconds: number): string {
  return mmss(Math.max(0, seconds) * 1000);
}

/**
 * Whether a call the last read called live is STILL up, between refreshes.
 *
 * `live` is decided when the calls are read; a call the provider stops talking
 * about does not un-set it, so every reader has to re-apply the heartbeat. Three
 * did it by hand (the Live page, the tab strip's pulse, the phone tab bar's
 * count) and they did not agree — the bar counted `live` alone, so its badge
 * could stay lit for a call nobody had heard from until the next fetch. One
 * rule, here.
 */
export function liveStillUp(
  c: Pick<LiveCallVM, "live" | "heartbeatAtMs" | "startedAtMs">,
  heartbeatMs: number,
  nowMs: number,
): boolean {
  if (!c.live) return false;
  return nowMs - (c.heartbeatAtMs ?? c.startedAtMs ?? 0) < heartbeatMs;
}

/**
 * The calls of a read that are STILL up at `nowMs`: its `now`, each asked liveStillUp with the read's own heartbeat. What
 * every count of calls in progress asks, so none counts `live` alone: the bar over the page (liveBar), the Live page and
 * the tab strip's pulse, and the number the phone keeps a call's Lock Screen activity for.
 */
export function callsStillUp<C extends Pick<LiveCallVM, "live" | "heartbeatAtMs" | "startedAtMs">>(
  read: { now: readonly C[]; heartbeatMs: number } | null | undefined,
  nowMs: number,
): C[] {
  return (read?.now ?? []).filter((c) => liveStillUp(c, read?.heartbeatMs ?? 0, nowMs));
}

/** What the shell says across the top while someone is on the phone. */
export interface LiveBarVM {
  /** The one call to open, or null when there are several and the bar opens the list. */
  callId: string | null;
  /** "On the phone now · Dana" or "2 calls on your line now". */
  text: string;
  /** How long it has been running, for the bar's clock; null when unknown or several. */
  sinceMs: number | null;
  /** Still marked live, but the provider has gone quiet: no clock, and it says so. */
  checking: boolean;
}

/**
 * The live-call bar, or nothing.
 *
 * A call in progress is the most time-critical thing the product knows, and it
 * is true for minutes a week — so it is a bar the shell shows while it is
 * happening rather than a place in the nav that is empty the rest of the time.
 * It carries no controls: ending a call and handing it over are decisions with
 * confirmations, and they belong on Live, which this opens.
 */
export function liveBar(vm: LiveVM | null | undefined, nowMs: number): LiveBarVM | null {
  const up = callsStillUp(vm, nowMs);
  if (up.length === 0) return null;
  if (up.length > 1) {
    return {
      callId: null,
      text: `${up.length} calls on your line now`,
      sinceMs: null,
      checking: up.some((c) => c.checking),
    };
  }
  const c = up[0];
  return {
    callId: c.callId,
    text: `On the phone now · ${c.whoShort}`,
    // A call whose provider has gone quiet gets no running clock: the number
    // would keep climbing for something that may already have ended.
    sinceMs: c.checking || c.startedAtMs === null ? null : Math.max(0, nowMs - c.startedAtMs),
    checking: c.checking,
  };
}

function turnsOf(dto: CallDto): LiveTurnVM[] {
  return (dto.transcript_object ?? [])
    .filter((turn) => turn.role === "agent" || turn.role === "user" || turn.role === "injected")
    .map((turn) => {
      const start = turn.start ?? turn.words?.[0]?.start;
      if (turn.role === "injected") {
        // The owner's words, not the frame around them -- or the platform's,
        // said as the platform's; injected turns carry no word timing.
        const said = injectedTurn(turn.content);
        return { speaker: said.speaker, text: said.text, t: "—" };
      }
      return {
        speaker: turn.role === "agent" ? "agent" : "client",
        text: turn.content ?? "",
        t: typeof start === "number" ? mmss(start * 1000) : "—",
      };
    });
}

/**
 * A call the provider has gone quiet on, or that has run past what a call runs: "still marked live · checking", and the
 * words for why. Nothing for a call that is not live.
 */
function checkingOf(
  live: boolean,
  startedAtMs: number | null,
  heartbeatAtMs: number | null,
  nowMs: number,
): Pick<LiveCallVM, "checking" | "checkingWhy"> {
  if (!live) return { checking: false, checkingWhy: null };
  const sinceBeat = heartbeatAtMs === null ? 0 : nowMs - heartbeatAtMs;
  const sinceStart = startedAtMs === null ? 0 : nowMs - startedAtMs;
  if (sinceBeat > LIVE_STALE_MS) {
    return {
      checking: true,
      checkingWhy: `no word from the phone provider for ${Math.round(sinceBeat / MIN_MS)} minutes`,
    };
  }
  if (sinceStart > LIVE_OVERLONG_MS) {
    return { checking: true, checkingWhy: `live for over ${Math.floor(sinceStart / MIN_MS)} minutes` };
  }
  return { checking: false, checkingWhy: null };
}

/** Where the call's summary stands: a call that never connected has none to wait for; one in its grace after ending waits. */
function summaryStateOf(c: {
  missed: boolean;
  summary: string | null;
  live: boolean;
  endedMs: number | null;
  nowMs: number;
}): LiveCallVM["summaryState"] {
  if (c.missed) return "missed";
  if (c.summary) return "ready";
  return c.live || (c.endedMs !== null && c.nowMs - c.endedMs < ANALYSIS_GRACE_MS) ? "pending" : "none";
}

/** The call's turns, and the last thing the caller said: the last of their turns, else what a list's call carries in their place. */
function turnsAndLastOf(dto: CallDto): Pick<LiveCallVM, "transcript" | "saidLast"> {
  const transcript = turnsOf(dto);
  const said = [...transcript].reverse().find((t) => t.speaker === "client" && t.text);
  return { transcript, saidLast: said ? said.text : (dto.said_last ?? null) };
}

export function toLiveCallVM(dto: CallDto, tz: string, now = new Date()): LiveCallVM {
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
    initials: withheld ? "–" : initialsOf(who),
    ...callerMarks(dto.contact),
    // The CUSTOMER's number: on a call the receptionist placed, that is the one it dialled. The bell's missed-call
    // row named the business's own line under an outbound dial that never connected (the 2 Oct 2026 audit).
    number: withheld ? null : dto.direction === "outbound" ? formatPhoneDisplay(dto.to_e164) : (phone ?? dto.from_raw),
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
    duration: live || missed ? null : (callLength(dto.duration_ms) ?? null),
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
    ...turnsAndLastOf(dto),
  };
}

export function toLiveVM(calls: CallDto[], channels: ChannelDto[] | null, tz: string, now = new Date()): LiveVM {
  const vms = calls.map((c) => toLiveCallVM(c, tz, now));
  const nowList = vms.filter((c) => c.live).sort((a, b) => (a.startedAtMs ?? 0) - (b.startedAtMs ?? 0));
  const finished = vms.filter((c) => !c.live).sort((a, b) => (b.startedAtMs ?? 0) - (a.startedAtMs ?? 0));
  const recent = finished.slice(0, RECENT_MAX);
  const missedCalls = finished.filter((c) => missedCallIsNews(c, now.getTime()));

  const voice = channels?.find((ch) => ch.kind === "voice") ?? null;
  const line: LiveLineVM | null = voice
    ? {
        number: formatPhoneDisplay(voice.number_e164),
        on: voice.status === "active",
        offWords: `The line is switched off — ${PHONE_LINE_OFF.gets}.`,
        lastCallLabel: voice.last_inbound_at ? shortTime(voice.last_inbound_at, tz, now) : null,
      }
    : null;

  return {
    now: nowList,
    recent,
    missedCalls,
    line,
    lineRead: channels !== null,
    heartbeatMs: CALL_HEARTBEAT_MS,
    fetchedAtMs: now.getTime(),
  };
}
