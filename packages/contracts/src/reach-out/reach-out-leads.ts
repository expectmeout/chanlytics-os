/**
 * What comes back from a reach-out, where a lead is looked at (Reach out, Part 6: H8–H11). Leads while it writes: the
 * strip over an open search (reachOutStripOf) and the line under each lead's stage (reachOutLineOf); the peek's block
 * (reachOutTimelineOf) with its doors; and a person's page, which reads the same story through the lead it came from
 * (reachOutPersonOf). Every sentence is here, said by the business's clock, over the facts 00241's reads answer; a
 * number the database does not hold is never said.
 *
 * The lead workbench (00426): a reach-out fed by a list takes the leads you add (reach_out_add, its why-not words and
 * its answer's sentence), a lead's standing in its reach-out is one line every page reads (reachOutStandingOf, with
 * when its first email goes: reachOutWhenOf, the run and never a minute), and the drawer's People
 * (reach_out_chain_people) reads the lines Leads reads.
 */
import { clockDate, clockHour, clockNear, clockNearWhen, clockTime, zoneDayKey } from "../shared/clock";
import { capitalize, plural } from "../shared/words";
import { LEAD_FIT_WORDS, LEAD_STAGE_WORDS } from "../leads/lead-words";
import { skippedReasonWords } from "./reach-out-approval";
import { REPLY_INTENT_WORDS, isReplyIntent } from "./reach-out-replies";
import { REACH_OUT_SAID_WORDS, REACH_OUT_STOP_WORDS, REACH_OUT_UNDO_WORDS } from "./owner/lead-doors";
import { chainPaceOf, stepLabelOf } from "./reach-out-sheet";
import { localDate, localHour } from "../playbooks/playbook-schedule";
import { PLAYBOOK_HOURS } from "../playbooks/playbook-triggers";
import { addressOf } from "../activity/record-address";
import { leadFoundWords } from "../leads/lead-kind";
import type { ReachOutChainDto, ReachOutPeopleCountsDto } from "./reach-out-dtos";
import type { HandKind } from "./reach-out-hand";

/** A reading of a lead's reply, as the lines carry it. */
export interface ReachOutLineReplyDto {
  intent: string;
  claim: string;
  read_at: string;
  undone: boolean;
}

/** What a reach-out writes to (00426): its search, which the finder keeps current, or a list its owner adds leads to. */
export type ReachOutFedBy = "search" | "list";

/** One lead's facts in an open search's chain (00241 reach_out_search_lines; 00426 reach_out_root_lines). */
export interface ReachOutLeadLineDto {
  lead_id: string;
  /** The business, so a list of lines names each (00426; absent before it). */
  business_name?: string;
  /** When it was put on its reach-out's list, while nothing has been written to it (00426). */
  added_at?: string | null;
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
  /** How many of its emails wait, handed to their owner, to be sent from their inbox (00428; absent before it). */
  drafted?: number;
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
  /** When a deal that names the lead was won (00426): a count, never an amount; absent before it. */
  won_at?: string | null;
  stopped_at: string | null;
}

/** An open search's chain, as Leads draws it (00241 reach_out_search_lines): the strip's facts and the leads' lines. */
export interface ReachOutSearchLinesDto {
  chain: { root_id: string; name: string; state: string };
  /** Whether more leads can be added (a list) or its search keeps it current (00426; absent before it). */
  fed_by?: ReachOutFedBy;
  written_to: number;
  /** Emails that left since the business's midnight. */
  today: number;
  /** The next email: when, to whom, and the mailbox it leaves from (`host` its domain, from before 00424). */
  next: { at: string; business: string | null; host: string | null; from?: string | null } | null;
  held: number;
  /** How many of its emails wait to be sent from their owner's inbox (00428; absent before it). */
  to_send?: number;
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
  /** Its mailbox's domain, and its address (00424); a send from before 00424 names neither. */
  host: string | null;
  from?: string | null;
  message_id: string | null;
  email_status: string | null;
  bounced: boolean;
  /** The email left: sent, or failed by a receipt after it left (00179 email_left). */
  left: boolean;
  /** The run a drafted email waits in, where its owner sends it (00428: the server reads it for a drafted send). */
  run_id?: string | null;
  /** It left from its owner's own inbox, on their word (00428 said_at; the server reads it for one from no mailbox). */
  said?: boolean;
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

/** One step of a lead's chain, as its story counts them (00426). */
export interface ReachOutChainStepDto {
  n: number;
  after_days: number | null;
  hand: HandKind | null;
}

/**
 * A lead's chain, as its story reads it: since 00426 also what feeds it, its steps, its hour and the day it last ran,
 * and a run that waits for its owner (all absent before it).
 */
export interface ReachOutTimelineChainDto {
  root_id: string;
  name: string;
  state: string;
  fed_by?: ReachOutFedBy;
  run_hour?: number;
  last_run_for?: string | null;
  waiting_run_id?: string | null;
  steps?: ReachOutChainStepDto[];
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
  /** When a deal that names the lead was won (00426); absent before it. */
  won_at?: string | null;
  stopped_at: string | null;
  /** Found on a listing (the finder's); false for a lead a list of the owner's own brought (00242). Absent before it. */
  found_on_listing?: boolean;
  /** What the lead is and where it came from (00429): a company the people card found was on no listing, nor a list. */
  kind?: string;
  source?: string;
  /** When it was put on its reach-out's list, while nothing has been written to it (00426). */
  added_at?: string | null;
  chain: ReachOutTimelineChainDto | null;
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
  else if ((l.drafted ?? 0) > 0) parts.push("a nudge is handed to you to send");
  else if (l.next_at) parts.push(`next ${near(l.next_at, tz, nowMs)}`);
  return parts.join(" · ");
}

/**
 * The line under a lead's stage while a reach-out writes (H8), or null when the chain has done nothing with it. The
 * first that holds: booked and won (00426), their reply as read, said no, bounced, stopped, away, written (with its
 * nudges and what is next), held, planned, handed.
 */
export function reachOutLineOf(l: ReachOutLeadLineDto, nowMs: number, tz: string): string | null {
  const booked = at(l.booked_at);
  const won = at(l.won_at ?? null);
  if (won !== null)
    return `${booked !== null ? `Booked ${clockDate(booked, tz, nowMs)} · won` : "Won"} ${clockDate(won, tz, nowMs)}`;
  if (booked !== null) return `Booked ${clockNearWhen(booked, tz, nowMs)}`;
  const r = l.reply;
  if (personAnswered(r)) {
    if (r.intent === "no") return `Said no ${near(r.read_at, tz, nowMs)}`;
    const resume = at(l.resume_at);
    // Their own day, come: back to write to by hand (decision 9 of the workbench: no reach-out writes to them twice).
    if (r.intent === "not_now" && resume !== null && resume <= nowMs)
      return `Back · asked to hear from you ${askedDayOf(resume, tz, nowMs)}`;
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
  // Handed to its owner, written and checked (00428): it waits for them to send it from their inbox.
  if ((l.drafted ?? 0) > 0) return "Drafted for you · to send from your inbox";
  const next = at(l.next_at);
  if (next !== null) return capitalize(clockNearWhen(next, tz, nowMs));
  if (l.handed) return "Handed to you";
  if (l.added_at) return `Added ${near(l.added_at, tz, nowMs)} · not written yet`;
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
  chain: Pick<ReachOutChainDto, "mailboxes" | "owner_sends" | "gap_minutes"> | null,
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
    if (s.next.from || s.next.host) parts.push(`from ${s.next.from ?? s.next.host}`);
  } else parts.push("nothing more planned yet");
  if (s.held > 0) parts.push(`${s.held} held for your say`);
  if ((s.to_send ?? 0) > 0) parts.push(`${s.to_send} to send from your inbox`);
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

/** Why a send was skipped, in the run's own words; null for one a lead's story need not mention (a run stopped whole,
 *  or a lead taken back off its list before anything left: it never happened, as far as the lead is concerned). */
const skippedWords = (reason: string | null): string | null =>
  reason === "run_canceled" || reason === "owner_took_back" ? null : skippedReasonWords(reason ?? "");

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
    // An email its owner sent from their own inbox (00428) says so; one from before 00424 names no sender.
    const from = s.from || s.host ? ` · from ${s.from ?? s.host}` : s.said ? " · from your inbox" : "";
    const angle = s.angle ? ` · angle: ${s.angle}` : "";
    return line(`${name}${from}${angle} · ${emailWords(s)}`);
  }
  if (s.state === "handed") return line(`${name} · handed to you`);
  if (s.state === "drafted") return line(`${name} · handed to you to send`);
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
  const undone = r.undone ? " · undone" : "";
  const text =
    r.claim === "auto_reply" && r.intent === "away"
      ? `An automatic reply · away${until !== null ? ` until ${clockDate(until, tz, nowMs)}` : ""}${undone}`
      : `${r.claim === "owner" ? "You said they wrote back ·" : "They wrote back · read as"} ${intentWords(r.intent)}${undone}`;
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
  /** The reading's undo: its door, and what it says once done. */
  undo: { label: string; messageId: string; done: string } | null;
  /** A drafted email's run, where its owner sends it (00428). */
  send: { label: string; to: string } | null;
  /** They wrote back…: an email its owner sent is answered in their own inbox, so they say what came back (00428). */
  said: { label: string } | null;
}

export function reachOutTimelineOf(t: ReachOutLeadTimelineDto, nowMs: number, tz: string): ReachOutTimelineVM {
  const lines = [
    ...t.sends.map((s) => sendLine(s, tz, nowMs)),
    ...t.readings.map((r) => readingLine(r, tz, nowMs)),
  ].filter((x): x is ReachOutStoryLine => x !== null);
  lines.sort((a, b) => a.at - b.at);
  // A no is undone where it was read, whoever read it (the reply door's own rule: reach_out_reply_undoable).
  const undoable = t.readings.find((r) => r.can_undo && r.intent === "no" && !r.undone) ?? null;
  const stopped = at(t.stopped_at);
  const drafted = t.sends.find((s) => s.state === "drafted" && s.run_id);
  // An email its owner sent from their own inbox: its answer lands there, unread by us.
  const ownerSent = t.sends.some((s) => s.left && s.said === true);
  const answered = t.readings.some((r) => !r.undone && r.claim !== "auto_reply");
  return {
    label: `Reach out · ${t.chain?.name ?? t.search?.name ?? "a reach-out"}`,
    lines,
    stopped: stopped !== null ? `You stopped writing to them ${clockNear(stopped, tz, nowMs)}` : null,
    read: t.conversation_id ? { label: "Read what went out", to: `inbox/th-${t.conversation_id}` } : null,
    stop: t.can_stop && t.chain ? { label: REACH_OUT_STOP_WORDS.door } : null,
    undo: undoable
      ? { messageId: undoable.message_id, ...REACH_OUT_UNDO_WORDS[undoable.claim === "owner" ? "owner" : "read"] }
      : null,
    send: drafted ? { label: REACH_OUT_SAID_WORDS.sendIt, to: `broadcasts/run:${drafted.run_id}` } : null,
    said:
      ownerSent && !answered && !stopped && t.closed_reason !== "said_no" ? { label: REACH_OUT_SAID_WORDS.door } : null,
  };
}

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

export function reachOutPersonOf(t: ReachOutLeadTimelineDto, nowMs: number, tz: string): ReachOutPersonVM {
  const chain = t.chain?.name ?? null;
  const emails = new Map<string, { who: string; sub: string }>();
  for (const s of t.sends) {
    if (!s.left || !s.message_id) continue;
    const parts = [stepName(s.n, s.hand)];
    if (s.angle) parts.push(`angle: ${s.angle}`);
    if (s.from || s.host) parts.push(`from ${s.from ?? s.host}`);
    else if (s.said) parts.push("from your inbox");
    parts.push(emailWords(s));
    emails.set(s.message_id, { who: chain ? `Reach out · ${chain}` : "Your reach-out", sub: parts.join(" · ") });
  }
  const readings = new Map<string, string>();
  for (const r of t.readings)
    readings.set(
      r.message_id,
      `${r.claim === "owner" ? "You said" : "Read as"} ${intentWords(r.intent)} · ${readingEffect(r)}`,
    );
  const foundAt = at(t.found_at);
  const fit =
    t.search?.fit && t.search.fit in LEAD_FIT_WORDS
      ? LEAD_FIT_WORDS[t.search.fit as keyof typeof LEAD_FIT_WORDS]
      : null;
  const found =
    foundAt !== null
      ? {
          at: foundAt,
          text: [leadFoundWords(t), fit ? fit.toLowerCase() : null, t.email_state === "ok" ? "address checked" : null]
            .filter(Boolean)
            .join(" · "),
        }
      : null;
  return {
    emails,
    readings,
    found,
    about: t.chain
      ? `${t.chain.name} · ${stageWords(t.stage)} · ${reachOutStandingOf(t, nowMs, tz)?.words ?? "not written yet"}`
      : null,
  };
}

/* ------------------------------------------------------------------ where a lead stands, in one line (00426) -- */

/** A lead's standing in its reach-out: the one line the card, the peek, the person's page and Ask say. */
export interface ReachOutStandingVM {
  /** "Email 1 of 3 sent Tue · next Sat": capitalized, for a line of its own. */
  line: string;
  /** The same, lowercase, for after a "·". */
  words: string;
  tone: "plain" | "good" | "warn" | "bad";
  /** Stop writing to them may be asked (the door asks first: REACH_OUT_STOP_WORDS.ask). */
  stop: boolean;
}

const standing = (words: string, tone: ReachOutStandingVM["tone"], stop: boolean): ReachOutStandingVM => ({
  line: capitalize(words),
  words,
  tone,
  stop,
});

/**
 * When a lead nothing was written to yet goes: with its reach-out's run, never at a minute the run has not chosen (the
 * timetable places each email in its business's hours). A run that waits for its owner, a paused reach-out, today's
 * run still to come, the next hourly sweep (today's not made: an add after the hour is planned then, 00426), or
 * tomorrow's (today's made, or the day's last hour gone). A list-fed reach-out's first email always waits for its
 * owner's say first.
 */
export function reachOutWhenOf(c: ReachOutTimelineChainDto, nowMs: number, tz: string): string {
  if (c.waiting_run_id) return "a run waits for your say";
  if (c.state !== "running") return "nothing goes while it is paused";
  const hour = c.run_hour ?? PLAYBOOK_HOURS.min;
  const now = new Date(nowMs);
  const h = localHour(tz, now);
  const say = c.fed_by === "list" ? ", after your say" : "";
  if (c.last_run_for === localDate(tz, now) || h > PLAYBOOK_HOURS.max)
    return `goes with tomorrow's ${clockHour(hour)} run${say}`;
  if (h < hour) return `goes with today's ${clockHour(hour)} run${say}`;
  return `goes with the next run, within the hour${say}`;
}

/** What a person's answer did, after "wrote back Thu · interested". */
function answerStanding(
  r: ReachOutTimelineReadingDto,
  tz: string,
  nowMs: number,
  resume: number | null,
): ReachOutStandingVM {
  if (r.said_no || r.intent === "no")
    return standing(`said no ${near(r.read_at, tz, nowMs)} · nothing more will be written`, "bad", false);
  // Not now, and their day has come: Leads' Back today, written to by hand (decision 9 of the workbench).
  if (r.intent === "not_now" && resume !== null && resume <= nowMs)
    return standing(`asked to hear from you ${askedDayOf(resume, tz, nowMs)} · write to them yourself`, "warn", false);
  const what = `wrote back ${near(r.read_at, tz, nowMs)} · ${intentWords(r.intent)}`;
  return standing(r.stops || r.convert ? `${what} · the reach-out stopped` : what, "good", false);
}

/** The time of the earliest email planned in a live run, or null. */
const nextPlanned = (t: ReachOutLeadTimelineDto): number | null => {
  const times = t.sends
    .filter((s) => s.state === "planned")
    .map((s) => at(s.send_at))
    .filter((x): x is number => x !== null);
  return times.length > 0 ? Math.min(...times) : null;
};

/** Its emails so far: "email 2 of 3 sent Tue · next Sat", or the first one's wait; null when none is planned or sent. */
function writtenStanding(t: ReachOutLeadTimelineDto, tz: string, nowMs: number): ReachOutStandingVM | null {
  const left = t.sends.filter((s) => s.left && s.n !== null);
  const steps = t.chain?.steps?.filter((s) => !s.hand).length ?? 0;
  const held = t.sends.some((s) => s.state === "held");
  const drafted = t.sends.some((s) => s.state === "drafted");
  const planned = nextPlanned(t);
  if (left.length === 0) {
    if (held) return standing("email 1 waits for your say", "warn", false);
    if (drafted) return standing("email 1 is handed to you to send", "warn", false);
    if (planned !== null) return standing(`email 1 goes ${clockNearWhen(planned, tz, nowMs)}`, "plain", false);
    return null;
  }
  const last = left.at(-1);
  const k = (last?.n ?? 0) + 1;
  const parts = [`${steps >= k ? `email ${k} of ${steps} sent` : "written"} ${near(last?.sent_at ?? null, tz, nowMs)}`];
  if (held) parts.push("the next waits for your say");
  else if (drafted) parts.push("the next is handed to you to send");
  else if (planned !== null) parts.push(`next ${clockNearWhen(planned, tz, nowMs)}`);
  else if (steps > k) parts.push("the next if nothing comes back");
  else parts.push("the last email");
  return standing(parts.join(" · "), "plain", t.can_stop);
}

/**
 * Where a lead stands in its reach-out, the first that holds: booked; a person's answer (an automatic reply is not one:
 * away only pauses it); said no; stopped; bounced; away; its emails so far and what is next; not written yet, with when
 * it goes. Null for a lead with no reach-out.
 */
export function reachOutStandingOf(t: ReachOutLeadTimelineDto, nowMs: number, tz: string): ReachOutStandingVM | null {
  if (!t.chain) return null;
  const booked = at(t.booked_at);
  const won = at(t.won_at ?? null);
  if (won !== null)
    return standing(
      `${booked !== null ? `booked ${clockDate(booked, tz, nowMs)} · ` : ""}won ${clockDate(won, tz, nowMs)}`,
      "good",
      false,
    );
  if (booked !== null) return standing(`booked ${clockNearWhen(booked, tz, nowMs)}`, "good", false);
  const person = t.readings.find((r) => !r.undone && r.claim !== "auto_reply") ?? null;
  if (person) return answerStanding(person, tz, nowMs, at(t.resume_at));
  if (t.closed_reason === "said_no") return standing("said no · nothing more will be written", "bad", false);
  if (t.stopped_at) return standing(`you stopped writing to them ${near(t.stopped_at, tz, nowMs)}`, "plain", false);
  if (t.sends.some((s) => s.bounced)) return standing("bounced · nothing more will be written", "bad", false);
  const away = t.readings.find((r) => !r.undone && r.intent === "away" && at(r.until_at) !== null);
  const back = away ? at(away.until_at) : null;
  if (back !== null && back > nowMs)
    return standing(`away until ${clockDate(back, tz, nowMs)} · the reach-out waits`, "plain", t.can_stop);
  const written = writtenStanding(t, tz, nowMs);
  if (written) return written;
  const added = t.added_at ? `added ${near(t.added_at, tz, nowMs)} · ` : "";
  const when = reachOutWhenOf(t.chain, nowMs, tz);
  return standing(`${added}not written yet · ${when}`, t.chain.waiting_run_id ? "warn" : "plain", false);
}

/* ---------------------------------------------------------------- adding leads to a reach-out (00426) -- */

/**
 * Why a lead would not be added, or written to (reach_out_why_not's, then reach_out_add's own): the one closed set the
 * door answers in.
 */
export const REACH_OUT_WHY_NOT = [
  "gone",
  "closed",
  "customer",
  "suppressed",
  "written",
  "shared",
  "no_email",
  "checking",
  "unconfirmed",
  "invalid",
  "unchecked",
  "already",
  "not_counted",
  "elsewhere",
] as const;
export type ReachOutWhyNot = (typeof REACH_OUT_WHY_NOT)[number];

/** Each reason, in the words after a count ("1 already a customer"). */
export const REACH_OUT_WHY_NOT_WORDS: Record<ReachOutWhyNot, string> = {
  gone: "no longer in your leads",
  closed: "already worked",
  customer: "already a customer",
  suppressed: "asked not to be written to",
  written: "already written to",
  shared: "sharing a number or site with another lead",
  no_email: "with no email address",
  checking: "with an address still being checked",
  unconfirmed: "with an address that can't be confirmed",
  invalid: "with an address that bounced",
  unchecked: "with an address not checked yet",
  already: "already on it",
  not_counted: "still in Needs review",
  elsewhere: "with another reach-out",
};

/** One lead the door left out, and the reach-out that has it when another does. */
export interface ReachOutAddLeadDto {
  lead_id: string;
  why: ReachOutWhyNot;
  chain_id: string | null;
  chain_name: string | null;
}

/** What POST reach-outs/:id/leads answered (00426 reach_out_add): dry, what would join; else what joined. */
export interface ReachOutAddDto {
  dry: boolean;
  added: number;
  /** Dry: how many would join. */
  would_add?: number;
  /** The add, for its undo (lead_undo by this id at this version). */
  op_id?: string;
  version?: number;
  left_out: Partial<Record<ReachOutWhyNot, number>>;
  leads: ReachOutAddLeadDto[];
  /** How many on its list it would write to now. */
  waiting?: number;
  /** Its first step's share of a run. */
  cap: number;
}

/** The door's refusals and its undo's answers, in words. */
export const REACH_OUT_ADD_WORDS = {
  listGone: "That reach-out's list was removed, so nothing can be added to it.",
  fedBySearch: "That reach-out writes to its search's leads as they're found, so leads aren't added to it by hand.",
  door: "Add to its reach-out",
  takenBack: (n: number) => `Took ${plural(n, "lead", "leads")} back off the list`,
  onItsWay: "Its email is already on its way, so it stays. Stop writing to them instead.",
  sent: "Its email was already sent, so it stays. Stop writing to them instead.",
  /** The drawer's door on a lead waiting in a reach-out fed by a list (00426 reach_out_leave_out). */
  leaveOut: "Leave out",
  leftOut: (name: string) => `Left ${name} out. Nothing had been written to them.`,
  backOn: (name: string) => `${name} is back on its list.`,
  notOnIt: "That lead is no longer on its list.",
} as const;

/** The left-out counts, most first: "1 already on it, 2 with no email address", one other reach-out by its name. */
function leftOutWords(a: ReachOutAddDto): string[] {
  const named = a.leads.filter((l) => l.why === "elsewhere" && l.chain_name);
  const one = named.length === 1 ? named.at(0)?.chain_name : null;
  return Object.entries(a.left_out)
    .filter(([, n]) => (n ?? 0) > 0)
    .sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0) || x[0].localeCompare(y[0]))
    .map(([why, n]) =>
      why === "elsewhere" && n === 1 && one
        ? `1 with “${one}”`
        : `${n} ${REACH_OUT_WHY_NOT_WORDS[why as ReachOutWhyNot] ?? why}`,
    );
}

/** What an add said, dry or done: "Adds 2 leads to “Early gyms” · 3 left out: 1 already on it, 2 with no email address". */
export function reachOutAddWords(
  a: ReachOutAddDto,
  chainName: string,
): { text: string; tone: "good" | "warn" | "plain" } {
  const joined = a.dry ? (a.would_add ?? 0) : a.added;
  const left = Object.values(a.left_out).reduce<number>((n, x) => n + (x ?? 0), 0);
  const head =
    joined === 0
      ? `None can be added to “${chainName}”`
      : `${a.dry ? "Adds" : "Added"} ${plural(joined, "lead", "leads")} to “${chainName}”`;
  return {
    text: left > 0 ? `${head} · ${left} left out: ${leftOutWords(a).join(", ")}` : head,
    tone: joined === 0 ? "warn" : a.dry ? "plain" : "good",
  };
}

/** A day as a person asked for it: "today", "yesterday" or "on Oct 20" (Leads' Back today says it so too). */
export function askedDayOf(atMs: number, tz: string, nowMs: number): string {
  const near = clockNearWhen(atMs, tz, nowMs).toLowerCase();
  return near.startsWith("today")
    ? "today"
    : near.startsWith("yesterday")
      ? "yesterday"
      : `on ${clockDate(atMs, tz, nowMs)}`;
}

/**
 * What came of a reach-out, its drawer's line (canvas B's loop): "44 found · 31 written to · 3 wrote back · 1 booked ·
 * 1 won". Found and written are said always; an outcome only once there is one. Null before the drawer's read carried it.
 */
export function reachOutCameWords(p: Pick<ReachOutChainPeopleDto, "counts" | "came" | "fed_by">): string | null {
  const c = p.came;
  if (!c) return null;
  const found = `${p.counts.of} ${p.fed_by === "list" ? "on its list" : "found"}`;
  const parts = [found, `${c.written} written to`];
  if (c.wrote_back) parts.push(`${c.wrote_back} wrote back`);
  if (c.booked) parts.push(`${c.booked} booked`);
  if (c.won) parts.push(`${c.won} won`);
  return parts.join(" · ");
}

/** A search or a list a reach-out could start from (00426 reach_out_sources): New message's Write to leads. */
export interface ReachOutSourceDto {
  id: string;
  name: string;
  /** How it was made: the finder (people, ask), or a list of the owner's own (chosen on the Leads table, import). */
  via: string;
  asked_on: string;
  /** Who a reach-out over it would write to now, and with the unconfirmed addresses included. */
  ready: number;
  with_unconfirmed: number;
}

/** Write to leads, New message's third choice (canvas B's Campaigns), in words. */
export const REACH_OUT_SOURCE_WORDS = {
  addTitle: "Leads you add",
  addSub: "Pick them on Leads, one at a time or from the table, then write to them",
  failed: "the searches and lists a reach-out could start from",
  none: "Every search and list with someone to write to has its reach-out. Find more businesses on Leads.",
  find: "Find businesses",
} as const;

/** One source as its row says it: its name and who it would write to, then what it is. */
export function reachOutSourceOf(s: ReachOutSourceDto): { title: string; sub: string; include: boolean } {
  const include = s.ready === 0;
  const reach = include ? `${s.with_unconfirmed} unconfirmed` : `${s.ready} ready`;
  const what =
    s.via === "chosen"
      ? "A list you made on the Leads table"
      : s.via === "import"
        ? "A list you imported"
        : "A search with no reach-out yet";
  return { title: `${s.name} · ${reach}`, sub: what, include };
}

/**
 * A reach-out's drawer open at who is in it (00426, canvas B's Campaigns): `campaigns/moment:<id>:people`, so a link from
 * Today, the bell or Leads lands on its People, and Back steps out of it.
 */
export const reachOutPeopleRoute = (rootId: string): string => `${addressOf({ kind: "reach_out", id: rootId })}:people`;

/** Who is in a reach-out, as its drawer lists them (00426 reach_out_chain_people). */
export interface ReachOutChainPeopleDto {
  root_id: string;
  fed_by: ReachOutFedBy;
  search: { id: string; name: string } | null;
  counts: ReachOutPeopleCountsDto & { of: number };
  /** What came of it (00426): of everyone it has, written to, wrote back, booked and won, each lead once. */
  came?: { written: number; wrote_back: number; booked: number; won: number };
  waiting: ReachOutLeadLineDto[];
  writing: ReachOutLeadLineDto[];
  done: ReachOutLeadLineDto[];
}
