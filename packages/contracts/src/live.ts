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
import { CALL_HEARTBEAT_MS, isLiveCall } from "./policy";
import { formatPhoneDisplay } from "./phone";
import { DISCONNECTION_LABELS, initialsOf, shortTime, spokenDuration, type CallDto } from "./viewmodels";
import { callOutcomeWords } from "./call-words";
import type { ChannelDto } from "./channels";

/** A live call whose heartbeat is older than this is "still marked live · checking". */
export const LIVE_STALE_MS = 5 * 60 * 1000;
/** A call live longer than this is flagged the same way: long calls happen, rarely. */
export const LIVE_OVERLONG_MS = 30 * 60 * 1000;
/** Retell's analysis lands a little after call_ended; until then "no summary"
 *  is a fact about the clock, not the call. */
export const ANALYSIS_GRACE_MS = 10 * 60 * 1000;
/** How many finished calls the page lists beside the live ones. */
export const RECENT_MAX = 8;

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
  /** Display phone, or null when the caller ID was withheld. */
  number: string | null;
  direction: "inbound" | "outbound";
  status: string;
  /** In progress under the heartbeat rule. */
  live: boolean;
  /** Retell's not_connected: the dial never connected. */
  missed: boolean;
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
  /** mm:ss once the call has ended; null while live (the page runs its own clock). */
  duration: string | null;
  summaryState: "ready" | "pending" | "none" | "missed";
  summary: string | null;
  sentiment: string | null;
  /** Why the call ended, in the owner's words. */
  endedHow: string | null;
  recordingState: "ready" | "pending" | "failed" | "purged" | "none";
  /** What the caller wanted, in the post-call analysis's plain words; null while live or without an analysis. */
  wanted: string | null;
  /** How it ended, in the owner's words (callOutcomeWords); null without an analysis outcome. */
  outcomeWords: string | null;
  /** What to do next, from the analysis. */
  followUp: string | null;
  /** The name the caller gave. */
  callerName: string | null;
  /** "3 min 10 sec" once the call has ended: a length in words, so it never reads as a time beside a date. */
  lengthWords: string | null;
  transcript: LiveTurnVM[];
}

export interface LiveLineVM {
  number: string | null;
  on: boolean;
  /** When the line last rang, in the same short form. */
  lastCallLabel: string | null;
}

export interface LiveVM {
  /** In progress, oldest first — the one that has been waiting longest leads. */
  now: LiveCallVM[];
  /** Finished or missed, newest first, at most RECENT_MAX. */
  recent: LiveCallVM[];
  /** The voice channel, or null when the workspace has no phone line. */
  line: LiveLineVM | null;
  /** Whether the channels read succeeded; false means the line's state is unknown, not absent. */
  lineRead: boolean;
  heartbeatMs: number;
  fetchedAtMs: number;
}

const mmss = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

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
  const up = (vm?.now ?? []).filter((c) => liveStillUp(c, vm?.heartbeatMs ?? 0, nowMs));
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

export function toLiveCallVM(dto: CallDto, tz: string, now = new Date()): LiveCallVM {
  const nowMs = now.getTime();
  const withheld = !dto.from_e164 && !dto.from_raw;
  const phone = formatPhoneDisplay(dto.from_e164);
  const name = dto.contact?.display_name || dto.contact?.wa_profile_name || null;
  const who = withheld ? "Caller ID withheld" : name || phone || dto.from_raw || "Unknown caller";
  // A phone-like name is not split: "+1" is nobody's first name.
  const whoShort = name ? (/^[+\d(]/.test(name) ? name : name.split(" ")[0]) : "the caller";

  const live = isLiveCall(dto, now);
  const missed = dto.status === "not_connected";
  const startedAtMs = dto.started_at ? new Date(dto.started_at).getTime() : null;
  const beat = dto.updated_at ?? dto.started_at;
  const heartbeatAtMs = beat ? new Date(beat).getTime() : null;

  let checking = false;
  let checkingWhy: string | null = null;
  if (live) {
    const sinceBeat = heartbeatAtMs === null ? 0 : nowMs - heartbeatAtMs;
    const sinceStart = startedAtMs === null ? 0 : nowMs - startedAtMs;
    if (sinceBeat > LIVE_STALE_MS) {
      checking = true;
      checkingWhy = `no word from the phone provider for ${Math.round(sinceBeat / 60_000)} minutes`;
    } else if (sinceStart > LIVE_OVERLONG_MS) {
      checking = true;
      checkingWhy = `live for over ${Math.floor(sinceStart / 60_000)} minutes`;
    }
  }

  const endedMs = dto.ended_at ? new Date(dto.ended_at).getTime() : null;
  const summary = (dto.summary ?? "").trim() || null;
  const summaryState: LiveCallVM["summaryState"] = missed
    ? "missed"
    : summary
      ? "ready"
      : live || (endedMs !== null && nowMs - endedMs < ANALYSIS_GRACE_MS)
        ? "pending"
        : "none";

  const recordingState: LiveCallVM["recordingState"] =
    dto.recording?.fetch_state === "stored"
      ? "ready"
      : dto.recording?.fetch_state === "failed"
        ? "failed"
        : dto.recording?.fetch_state === "purged"
          ? "purged"
          : dto.recording
            ? "pending"
            : "none";

  return {
    callId: dto.id,
    cvId: `cv-${dto.id}`,
    clientId: dto.contact_id,
    who,
    whoShort,
    initials: withheld ? "–" : initialsOf(who),
    number: withheld ? null : (phone ?? dto.from_raw),
    direction: dto.direction,
    status: dto.status,
    live,
    missed,
    stale: dto.status === "ongoing" && !live,
    checking,
    checkingWhy,
    startedAtMs,
    heartbeatAtMs,
    startedLabel: shortTime(dto.started_at, tz, now),
    duration: live || missed || !dto.duration_ms ? null : mmss(dto.duration_ms),
    summaryState,
    summary,
    sentiment: dto.sentiment,
    endedHow: dto.disconnection_reason
      ? (DISCONNECTION_LABELS[dto.disconnection_reason] ?? dto.disconnection_reason.replace(/_/g, " "))
      : null,
    recordingState,
    // The analysis's words, as toCallVM reads them; none while the call is still on the line.
    wanted: live ? null : dto.wanted?.trim() || null,
    outcomeWords: live ? null : callOutcomeWords(dto.outcome),
    followUp: live ? null : dto.follow_up?.trim() || null,
    callerName: dto.caller_name?.trim() || null,
    lengthWords: live || missed || !dto.duration_ms ? null : spokenDuration(dto.duration_ms),
    transcript: turnsOf(dto),
  };
}

export function toLiveVM(calls: CallDto[], channels: ChannelDto[] | null, tz: string, now = new Date()): LiveVM {
  const vms = calls.map((c) => toLiveCallVM(c, tz, now));
  const nowList = vms.filter((c) => c.live).sort((a, b) => (a.startedAtMs ?? 0) - (b.startedAtMs ?? 0));
  const recent = vms
    .filter((c) => !c.live)
    .sort((a, b) => (b.startedAtMs ?? 0) - (a.startedAtMs ?? 0))
    .slice(0, RECENT_MAX);

  const voice = channels?.find((ch) => ch.kind === "voice") ?? null;
  const line: LiveLineVM | null = voice
    ? {
        number: formatPhoneDisplay(voice.number_e164),
        on: voice.status === "active",
        lastCallLabel: voice.last_inbound_at ? shortTime(voice.last_inbound_at, tz, now) : null,
      }
    : null;

  return {
    now: nowList,
    recent,
    line,
    lineRead: channels !== null,
    heartbeatMs: CALL_HEARTBEAT_MS,
    fetchedAtMs: now.getTime(),
  };
}
