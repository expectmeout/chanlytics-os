/**
 * What comes back from a reach-out, where a lead is looked at (Reach out, Part 6: H8–H11). Leads while it writes: the
 * strip over an open search (reachOutStripOf) and the line under each lead's stage (reachOutLineOf); the peek's block
 * (reachOutTimelineOf) with its doors; and a person's page, which reads the same story through the lead it came from
 * (reachOutPersonOf). Every sentence is here, said by the business's clock, over the facts 00241's reads answer; a
 * number the database does not hold is never said.
 */
import { clockDate, clockNear, clockNearWhen, clockTime, zoneDayKey } from "../shared/clock";
import { capitalize, plural } from "../shared/words";
import { LEAD_FIT_WORDS, LEAD_STAGE_WORDS } from "../leads/lead-words";
import { skippedReasonWords } from "./reach-out-approval";
import { REPLY_INTENT_WORDS, isReplyIntent } from "./reach-out-replies";
import { chainPaceOf, stepLabelOf } from "./reach-out-sheet";
import type { ReachOutChainDto } from "./reach-out-dtos";
import type { HandKind } from "./reach-out-hand";

/** A reading of a lead's reply, as the lines carry it. */
export interface ReachOutLineReplyDto {
  intent: string;
  claim: string;
  read_at: string;
  undone: boolean;
}

/** One lead's facts in an open search's chain (00241 reach_out_search_lines). */
export interface ReachOutLeadLineDto {
  lead_id: string;
  stage: string;
  closed_reason: string | null;
  /** Emails that left for it. */
  sent: number;
  first_sent_at: string | null;
  last_sent_at: string | null;
  /** Its next email's time, planned in a live run. */
  next_at: string | null;
  /** An email of it waits for its owner's say. */
  held: boolean;
  /** A hand step gave it to the team. */
  handed: boolean;
  bounced: boolean;
  bounced_at: string | null;
  /** The lead's address as last checked: a permanent bounce marks it invalid (C11). */
  email_state: string | null;
  /** Its newest reading. */
  reply: ReachOutLineReplyDto | null;
  /** An automatic out-of-office's day back, while it is ahead. */
  away_until: string | null;
  resume_at: string | null;
  booked_at: string | null;
  stopped_at: string | null;
}

/** An open search's chain, as Leads draws it (00241 reach_out_search_lines): the strip's facts and the leads' lines. */
export interface ReachOutSearchLinesDto {
  chain: { root_id: string; name: string; state: string };
  written_to: number;
  /** Emails that left since the business's midnight. */
  today: number;
  next: { at: string; business: string | null; host: string | null } | null;
  held: number;
  waiting_run_id: string | null;
  leads: ReachOutLeadLineDto[];
}

/** One send of a lead's chain (00241 reach_out_lead_timeline). */
export interface ReachOutTimelineSendDto {
  id: string;
  /** 0 for the first email; null when its step was dropped from the chain since. */
  n: number | null;
  hand: HandKind | null;
  state: string;
  reason: string | null;
  send_at: string | null;
  sent_at: string | null;
  angle: string | null;
  host: string | null;
  message_id: string | null;
  email_status: string | null;
  bounced: boolean;
  /** The email left: sent, or failed by a receipt after it left (00179 email_left). */
  left: boolean;
}

/** One reading of a lead's reply (00241 reach_out_lead_timeline). */
export interface ReachOutTimelineReadingDto {
  message_id: string;
  read_at: string;
  intent: string;
  claim: string;
  summary: string | null;
  undone: boolean;
  until_at: string | null;
  /** What it did, as its door recorded it (contracts readingPlan, kept on the reading): the chain stopped, Talking, no. */
  stops: boolean;
  convert: boolean;
  said_no: boolean;
  /** The caller may undo it (00222 reach_out_reply_undoable, the one rule). */
  can_undo: boolean;
}

/** One lead's reach-out, as its peek and its person's page draw it (00241 reach_out_lead_timeline). */
export interface ReachOutLeadTimelineDto {
  lead_id: string;
  business_name: string;
  stage: string;
  closed_reason: string | null;
  found_at: string | null;
  email_state: string | null;
  resume_at: string | null;
  booked_at: string | null;
  stopped_at: string | null;
  /** Found on a listing (the finder's); false for a lead a list of the owner's own brought (00242). Absent before it. */
  found_on_listing?: boolean;
  chain: { root_id: string; name: string; state: string } | null;
  search: { id: string; name: string; asked: string | null; fit: string | null } | null;
  /** The person's email thread, where the reach-out's emails and the answers to them are. */
  conversation_id: string | null;
  sends: ReachOutTimelineSendDto[];
  readings: ReachOutTimelineReadingDto[];
  can_stop: boolean;
}

/** What GET reach-outs/leads answers: a search's lines with its chain as Playbooks reads it, or one lead's story. */
export interface ReachOutLeadsDto {
  lines: ReachOutSearchLinesDto | null;
  /** The search's chain, for its day's share (chainPaceOf); null when it has none, or asked of one lead. */
  chain: ReachOutChainDto | null;
  timeline: ReachOutLeadTimelineDto | null;
}

/** What "Stop writing to them" answered (00241 reach_out_lead_stop). */
export interface ReachOutStopDto {
  stopped: boolean;
  already: boolean;
  skipped: number;
  leaving: number;
}

const at = (iso: string | null | undefined): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

/** A day near today, as the lines say it: "today", "Tue", "Sep 12". */
const near = (iso: string | null, tz: string, nowMs: number): string => {
  const t = at(iso);
  return t === null ? "" : clockNear(t, tz, nowMs);
};

/** The intent a reply was read as, in the words after "Wrote back ·". */
const intentWords = (intent: string): string => (isReplyIntent(intent) ? REPLY_INTENT_WORDS[intent] : "wrote back");

/** Whether a reading is a person's answer: not undone, and not an automatic reply's (which only pauses, or says no). */
const personAnswered = (r: ReachOutLineReplyDto | null): r is ReachOutLineReplyDto =>
  !!r && !r.undone && r.claim !== "auto_reply";

/** "Written Tue · nudged Sat", and the next when one is planned. */
function writtenWords(l: ReachOutLeadLineDto, tz: string, nowMs: number): string {
  const parts = [`Written ${near(l.first_sent_at, tz, nowMs)}`];
  if (l.sent > 1) parts.push(`nudged ${near(l.last_sent_at, tz, nowMs)}`);
  if (l.held) parts.push("a nudge waits for your say");
  else if (l.next_at) parts.push(`next ${near(l.next_at, tz, nowMs)}`);
  return parts.join(" · ");
}

/**
 * The line under a lead's stage while a reach-out writes (H8), or null when the chain has done nothing with it. The
 * first that holds: booked, their reply as read, said no, bounced, stopped, away, written (with its nudges and what is
 * next), held, planned, handed.
 */
export function reachOutLineOf(l: ReachOutLeadLineDto, nowMs: number, tz: string): string | null {
  const booked = at(l.booked_at);
  if (booked !== null) return `Booked ${clockNearWhen(booked, tz, nowMs)}`;
  const r = l.reply;
  if (personAnswered(r)) {
    if (r.intent === "no") return `Said no ${near(r.read_at, tz, nowMs)}`;
    const resume = at(l.resume_at);
    if (r.intent === "not_now" && resume !== null) return `Not now · until ${clockDate(resume, tz, nowMs)}`;
    if (r.intent === "away" && resume !== null) return `Away · back ${clockDate(resume, tz, nowMs)}`;
    return `Wrote back ${near(r.read_at, tz, nowMs)} · ${intentWords(r.intent)}`;
  }
  if (l.closed_reason === "said_no") return "Said no";
  if (l.bounced)
    return `Bounced ${near(l.bounced_at, tz, nowMs)}${l.email_state === "invalid" ? " · address dropped" : ""}`;
  if (l.stopped_at) return `Stopped ${near(l.stopped_at, tz, nowMs)}`;
  const away = at(l.away_until);
  if (l.sent > 0 && away !== null && away > nowMs)
    return `Written ${near(l.first_sent_at, tz, nowMs)} · away until ${clockDate(away, tz, nowMs)}`;
  if (l.sent > 0) return writtenWords(l, tz, nowMs);
  if (l.held) return "Held for your say";
  const next = at(l.next_at);
  if (next !== null) return capitalize(clockNearWhen(next, tz, nowMs));
  if (l.handed) return "Handed to you";
  return null;
}

/** The strip's doors: how it is going (the chain's row on Playbooks), Pause or Resume, and a run waiting. */
export interface ReachOutStripVM {
  title: string;
  parts: string[];
  running: boolean;
  /** Today's emails of the day's share, 0 to 1; null when there is no share to measure against. */
  progress: number | null;
  going: { label: string; to: string };
  toggle: { label: string; pause: boolean };
  waiting: { label: string; to: string } | null;
}

/** The strip over an open search while its reach-out writes (H8), by the business's clock. */
export function reachOutStripOf(
  s: ReachOutSearchLinesDto,
  chain: Pick<ReachOutChainDto, "domains"> | null,
  nowMs: number,
  tz: string,
): ReachOutStripVM {
  const running = s.chain.state === "running";
  const share = chain ? chainPaceOf(chain).share : 0;
  const parts: string[] = [share > 0 ? `${s.today} of ${share} today` : `${s.today} today`];
  const next = s.next ? at(s.next.at) : null;
  if (!running) parts.push("nothing goes while it is paused");
  else if (s.next && next !== null) {
    const when = zoneDayKey(next, tz) === zoneDayKey(nowMs, tz) ? clockTime(next, tz) : clockNearWhen(next, tz, nowMs);
    parts.push(`next ${when}${s.next.business ? `, ${s.next.business}` : ""}`);
    if (s.next.host) parts.push(`from ${s.next.host}`);
  } else parts.push("nothing more planned yet");
  if (s.held > 0) parts.push(`${s.held} held for your say`);
  return {
    title: running
      ? `Writing to ${plural(s.written_to, "business", "businesses")}`
      : `Paused · ${plural(s.written_to, "business", "businesses")} written to`,
    parts,
    running,
    progress: share > 0 ? Math.min(1, s.today / share) : null,
    going: { label: "How it's going", to: `outbound/${s.chain.root_id}` },
    toggle: running ? { label: "Pause", pause: true } : { label: "Resume", pause: false },
    waiting: s.waiting_run_id ? { label: "A run waits for you", to: `broadcasts/run:${s.waiting_run_id}` } : null,
  };
}

/** What became of an email, in a word. */
function emailWords(s: ReachOutTimelineSendDto): string {
  if (s.bounced) return "bounced";
  if (s.email_status === "delivered" || s.email_status === "read") return "delivered";
  if (s.email_status === "failed") return "not delivered";
  return "sent";
}

/** Why a send was skipped, in the run's own words; null for one a lead's story need not mention (a run stopped whole). */
const skippedWords = (reason: string | null): string | null =>
  reason === "run_canceled" ? null : skippedReasonWords(reason ?? "");

/** A step's name: "Your email", "A short nudge", "A call for you". */
const stepName = (n: number | null, hand: HandKind | null): string =>
  n === null ? "A step since removed" : stepLabelOf({ n, hand: hand ? { kind: hand } : null });

/** One line of a lead's story: its time and what happened. */
export interface ReachOutStoryLine {
  id: string;
  at: number;
  when: string;
  text: string;
}

/** A send's line in the story, or null when it says nothing worth a line. */
function sendLine(s: ReachOutTimelineSendDto, tz: string, nowMs: number): ReachOutStoryLine | null {
  const name = stepName(s.n, s.hand);
  const t = at(s.sent_at) ?? at(s.send_at);
  if (t === null) return null;
  const line = (text: string): ReachOutStoryLine => ({
    id: `s-${s.id}`,
    at: t,
    when: capitalize(clockNearWhen(t, tz, nowMs)),
    text,
  });
  if (s.left) {
    const from = s.host ? ` · from ${s.host}` : "";
    const angle = s.angle ? ` · angle: ${s.angle}` : "";
    return line(`${name}${from}${angle} · ${emailWords(s)}`);
  }
  if (s.state === "handed") return line(`${name} · handed to you`);
  if (s.state === "held") return line(`${name} · waits for your say`);
  if (s.state === "planned" || s.state === "claimed" || s.state === "queued") return line(`${name} · planned`);
  if (s.state === "failed") return line(`${name} · could not be sent`);
  const why = skippedWords(s.reason);
  return why ? line(`${name} · ${why}`) : null;
}

/** A reading's line in the story: what their reply was read as. */
function readingLine(r: ReachOutTimelineReadingDto, tz: string, nowMs: number): ReachOutStoryLine | null {
  const t = at(r.read_at);
  if (t === null) return null;
  const until = at(r.until_at);
  const text =
    r.claim === "auto_reply" && r.intent === "away"
      ? `An automatic reply · away${until !== null ? ` until ${clockDate(until, tz, nowMs)}` : ""}${r.undone ? " · undone" : ""}`
      : `They wrote back · read as ${intentWords(r.intent)}${r.undone ? " · undone" : ""}`;
  return { id: `r-${r.message_id}`, at: t, when: capitalize(clockNearWhen(t, tz, nowMs)), text };
}

/** The peek's block (H9): its head, the story oldest first, and its doors. */
export interface ReachOutTimelineVM {
  label: string;
  lines: ReachOutStoryLine[];
  /** "You stopped writing to them Tue", when they were stopped. */
  stopped: string | null;
  read: { label: string; to: string } | null;
  stop: { label: string } | null;
  undo: { label: string; messageId: string } | null;
}

export function reachOutTimelineOf(t: ReachOutLeadTimelineDto, nowMs: number, tz: string): ReachOutTimelineVM {
  const lines = [
    ...t.sends.map((s) => sendLine(s, tz, nowMs)),
    ...t.readings.map((r) => readingLine(r, tz, nowMs)),
  ].filter((x): x is ReachOutStoryLine => x !== null);
  lines.sort((a, b) => a.at - b.at);
  const undoable = t.readings.find((r) => r.can_undo && r.intent === "no" && !r.undone) ?? null;
  const stopped = at(t.stopped_at);
  return {
    label: `Reach out · ${t.chain?.name ?? t.search?.name ?? "a reach-out"}`,
    lines,
    stopped: stopped !== null ? `You stopped writing to them ${clockNear(stopped, tz, nowMs)}` : null,
    read: t.conversation_id ? { label: "Read what went out", to: `inbox/th-${t.conversation_id}` } : null,
    stop: t.can_stop && t.chain ? { label: REACH_OUT_STOP_WORDS.door } : null,
    undo: undoable ? { label: "Read as no · undo", messageId: undoable.message_id } : null,
  };
}

/** "Stop writing to them": the door, its question, what it did, and why it could not. */
export const REACH_OUT_STOP_WORDS = {
  door: "Stop writing to them",
  ask: (business: string) => `Stop writing to ${business}?`,
  detail:
    "No reach-out writes to them again: an email not yet with the mail provider is held back too. They stay in your leads, and you can still write to them yourself from the Inbox.",
  yes: "Stop writing",
  done: (business: string) => `Stopped: nothing more will be written to ${business}`,
  already: (business: string) => `${business} was already stopped`,
  failed: "Couldn't stop it. Nothing changed; try again.",
} as const;

/** What a person's page says of the reach-out that found them (H11), keyed by the messages it names. */
export interface ReachOutPersonVM {
  /** Each email the reach-out wrote them, by its message: who wrote it and the line under it. */
  emails: Map<string, { who: string; sub: string }>;
  /** Each reply of theirs that was read, by its message: the line under their words. */
  readings: Map<string, string>;
  /** Where they were found, with when; null when the lead says nothing of it. */
  found: { at: number; text: string } | null;
  /** The About rail's line: the chain, and where they stand in it. */
  about: string | null;
}

/**
 * What a reading did, in the few words a person's timeline puts under their reply: the plan its door recorded
 * (readingPlan, the one table of effects), never worked out again here.
 */
function readingEffect(r: ReachOutTimelineReadingDto): string {
  if (r.undone) return "undone";
  if (r.said_no) return "nothing more will be written";
  if (r.convert) return "the chain stopped · Talking";
  if (r.stops) return "the chain stopped";
  if (r.claim === "auto_reply" && r.intent === "away" && r.until_at) return "the chain waits";
  return "nothing changed";
}

/** A lead's stage in the Leads page's words: Ready, Contacted, Talking, Closed. */
const stageWords = (stage: string): string =>
  stage in LEAD_STAGE_WORDS ? LEAD_STAGE_WORDS[stage as keyof typeof LEAD_STAGE_WORDS] : stage;

/** Where a lead stands in its reach-out, for the About rail: "wrote back Thu · interested". */
function standingWords(t: ReachOutLeadTimelineDto, tz: string, nowMs: number): string {
  const reply = t.readings.find((r) => !r.undone && r.claim !== "auto_reply") ?? null;
  const booked = at(t.booked_at);
  if (booked !== null) return `booked ${clockNearWhen(booked, tz, nowMs)}`;
  if (reply) return `wrote back ${near(reply.read_at, tz, nowMs)} · ${intentWords(reply.intent)}`;
  if (t.closed_reason === "said_no") return "said no";
  if (t.stopped_at) return `stopped ${near(t.stopped_at, tz, nowMs)}`;
  const sent = t.sends.filter((s) => s.state === "sent");
  const last = sent.length ? sent[sent.length - 1]! : null;
  if (last) return `written ${near(last.sent_at, tz, nowMs)}`;
  return "not written yet";
}

export function reachOutPersonOf(t: ReachOutLeadTimelineDto, nowMs: number, tz: string): ReachOutPersonVM {
  const chain = t.chain?.name ?? null;
  const emails = new Map<string, { who: string; sub: string }>();
  for (const s of t.sends) {
    if (!s.left || !s.message_id) continue;
    const parts = [stepName(s.n, s.hand)];
    if (s.angle) parts.push(`angle: ${s.angle}`);
    if (s.host) parts.push(`from ${s.host}`);
    parts.push(emailWords(s));
    emails.set(s.message_id, { who: chain ? `Reach out · ${chain}` : "Your reach-out", sub: parts.join(" · ") });
  }
  const readings = new Map<string, string>();
  for (const r of t.readings) readings.set(r.message_id, `Read as ${intentWords(r.intent)} · ${readingEffect(r)}`);
  const foundAt = at(t.found_at);
  const fit =
    t.search?.fit && t.search.fit in LEAD_FIT_WORDS
      ? LEAD_FIT_WORDS[t.search.fit as keyof typeof LEAD_FIT_WORDS]
      : null;
  const found =
    foundAt !== null
      ? {
          at: foundAt,
          text: [
            // A lead a list of the owner's own brought (00242) was found on no listing.
            t.found_on_listing === false
              ? "From your list"
              : t.search?.asked
                ? `Found on Google Maps by “${t.search.asked}”`
                : "Found on Google Maps",
            fit ? fit.toLowerCase() : null,
            t.email_state === "ok" ? "address checked" : null,
          ]
            .filter(Boolean)
            .join(" · "),
        }
      : null;
  return {
    emails,
    readings,
    found,
    about: t.chain ? `${t.chain.name} · ${stageWords(t.stage)} · ${standingWords(t, tz, nowMs)}` : null,
  };
}
