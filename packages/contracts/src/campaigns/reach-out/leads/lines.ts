/** Leads: lines. */

import { clockDate, clockNear, clockNearWhen, clockTime, zoneDayKey } from "../../../shared/clock";
import { capitalize, plural } from "../../../shared/words";
import { skippedReasonWords } from "../approval";
import { REPLY_INTENT_WORDS, isReplyIntent } from "../replies/intents";
import { REACH_OUT_SAID_WORDS, REACH_OUT_STOP_WORDS, REACH_OUT_UNDO_WORDS } from "../owner/lead-doors";
import { chainPaceOf } from "../sheet/chain";
import { stepLabelOf } from "../sheet/words";
import type { ReachOutChainDto } from "../dtos";
import type { HandKind } from "../hand";
import { runRoute, sequenceRoute } from "../../sequences/address";

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
  /** How many of its emails wait, handed to their owner, to be sent from their inbox (00429; absent before it). */
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
  /** How many of its emails wait to be sent from their owner's inbox (00429; absent before it). */
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
  /** What a held email's check flagged (sequence_sends.hold_detail: the opening's words, a chain's count); absent before 00457. */
  hold_detail?: string | null;
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
  /** The run a drafted email waits in, where its owner sends it (00429: the server reads it for a drafted send). */
  run_id?: string | null;
  /** It left from its owner's own inbox, on their word (00429 said_at; the server reads it for one from no mailbox). */
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
  /** What the lead is and where it came from (00430): a company the people card found was on no listing, nor a list. */
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
  /**
   * Their place in the sequence (00455), the one record of where they stand: a leave between steps moves no send of
   * theirs, so only this says they left. Null before they have one; absent before 00455.
   */
  place?: { id: string; state: string; why: string | null; next_at: string | null } | null;
}

/** What GET reach-outs/leads answers: a search's lines with its chain as Playbooks reads it, or one lead's story. */
export interface ReachOutLeadsDto {
  lines: ReachOutSearchLinesDto | null;
  /** The search's chain, for its day's share (chainPaceOf); null when it has none, or asked of one lead. */
  chain: ReachOutChainDto | null;
  timeline: ReachOutLeadTimelineDto | null;
}

export const at = (iso: string | null | undefined): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

/** A day near today, as the lines say it: "today", "Tue", "Sep 12". */
export const near = (iso: string | null, tz: string, nowMs: number): string => {
  const t = at(iso);
  return t === null ? "" : clockNear(t, tz, nowMs);
};

/** The intent a reply was read as, in the words after "Wrote back ·". */
export const intentWords = (intent: string): string =>
  isReplyIntent(intent) ? REPLY_INTENT_WORDS[intent] : "wrote back";

/** Whether a reading is a person's answer: not undone, and not an automatic reply's (which only pauses, or says no). */
export const personAnswered = (r: ReachOutLineReplyDto | null): r is ReachOutLineReplyDto =>
  !!r && !r.undone && r.claim !== "auto_reply";

/** "Written Tue · followed up Sat", and the next when one is planned. */
export function writtenWords(l: ReachOutLeadLineDto, tz: string, nowMs: number): string {
  const parts = [`Written ${near(l.first_sent_at, tz, nowMs)}`];
  if (l.sent > 1) parts.push(`followed up ${near(l.last_sent_at, tz, nowMs)}`);
  if (l.held) parts.push("a follow-up waits for your OK");
  else if ((l.drafted ?? 0) > 0) parts.push("a follow-up is handed to you to send");
  else if (l.next_at) parts.push(`next ${near(l.next_at, tz, nowMs)}`);
  return parts.join(" · ");
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
  searchLines: ReachOutSearchLinesDto,
  chain: Pick<ReachOutChainDto, "mailboxes" | "owner_sends" | "gap_minutes"> | null,
  nowMs: number,
  tz: string,
): ReachOutStripVM {
  const running = searchLines.chain.state === "running";
  const share = chain ? chainPaceOf(chain).share : 0;
  const parts: string[] = [share > 0 ? `${searchLines.today} of ${share} today` : `${searchLines.today} today`];
  const next = searchLines.next ? at(searchLines.next.at) : null;
  if (!running) parts.push("nothing goes while it is paused");
  else if (searchLines.next && next !== null) {
    const when = zoneDayKey(next, tz) === zoneDayKey(nowMs, tz) ? clockTime(next, tz) : clockNearWhen(next, tz, nowMs);
    parts.push(`next ${when}${searchLines.next.business ? `, ${searchLines.next.business}` : ""}`);
    if (searchLines.next.from || searchLines.next.host)
      parts.push(`from ${searchLines.next.from ?? searchLines.next.host}`);
  } else parts.push("nothing more planned yet");
  if (searchLines.held > 0) parts.push(`${searchLines.held} held for your OK`);
  if ((searchLines.to_send ?? 0) > 0) parts.push(`${searchLines.to_send} to send from your inbox`);
  return {
    title: running
      ? `Writing to ${plural(searchLines.written_to, "business", "businesses")}`
      : `Paused · ${plural(searchLines.written_to, "business", "businesses")} written to`,
    parts,
    running,
    progress: share > 0 ? Math.min(1, searchLines.today / share) : null,
    going: { label: "How it's going", to: sequenceRoute(searchLines.chain.root_id) },
    toggle: running ? { label: "Pause", pause: true } : { label: "Resume", pause: false },
    waiting: searchLines.waiting_run_id
      ? { label: "Waits for your OK", to: runRoute(searchLines.waiting_run_id) }
      : null,
  };
}

/** What became of an email, in a word. */
export function emailWords(s: ReachOutTimelineSendDto): string {
  if (s.bounced) return "bounced";
  if (s.email_status === "delivered" || s.email_status === "read") return "delivered";
  if (s.email_status === "failed") return "not delivered";
  return "sent";
}

/** Why a send was skipped, in the run's own words; null for one a lead's story need not mention (a run stopped whole,
 *  or a lead taken back off its list before anything left: it never happened, as far as the lead is concerned). */
const skippedWords = (reason: string | null): string | null =>
  reason === "run_canceled" || reason === "owner_took_back" ? null : skippedReasonWords(reason ?? "");

/** A step's name, as a sequence's steps are said (decision 0060): "Email 1", "Email 2", "A call for you". */
export const stepName = (n: number | null, hand: HandKind | null): string =>
  n === null ? "A step since removed" : hand ? stepLabelOf({ n, hand: { kind: hand } }) : `Email ${n + 1}`;

/** One line of a lead's story: its time and what happened. */
export interface ReachOutStoryLine {
  id: string;
  at: number;
  when: string;
  text: string;
}

/** A send's line in the story, or null when it says nothing worth a line. */
function sendLine(timelineSend: ReachOutTimelineSendDto, tz: string, nowMs: number): ReachOutStoryLine | null {
  const name = stepName(timelineSend.n, timelineSend.hand);
  const item = at(timelineSend.sent_at) ?? at(timelineSend.send_at);
  if (item === null) return null;
  const line = (text: string): ReachOutStoryLine => ({
    id: `s-${timelineSend.id}`,
    at: item,
    when: capitalize(clockNearWhen(item, tz, nowMs)),
    text,
  });
  if (timelineSend.left) {
    // An email its owner sent from their own inbox (00429) says so; one from before 00424 names no sender.
    const from =
      timelineSend.from || timelineSend.host
        ? ` · from ${timelineSend.from ?? timelineSend.host}`
        : timelineSend.said
          ? " · from your inbox"
          : "";
    const angle = timelineSend.angle ? ` · angle: ${timelineSend.angle}` : "";
    return line(`${name}${from}${angle} · ${emailWords(timelineSend)}`);
  }
  if (timelineSend.state === "handed") return line(`${name} · handed to you`);
  if (timelineSend.state === "drafted") return line(`${name} · handed to you to send`);
  if (timelineSend.state === "held") return line(`${name} · waits for your OK`);
  if (timelineSend.state === "planned" || timelineSend.state === "claimed" || timelineSend.state === "queued")
    return line(`${name} · planned`);
  if (timelineSend.state === "failed") return line(`${name} · could not be sent`);
  const reason = skippedWords(timelineSend.reason);
  return reason ? line(`${name} · ${reason}`) : null;
}

/** A reading's line in the story: what their reply was read as. */
function readingLine(timelineReading: ReachOutTimelineReadingDto, tz: string, nowMs: number): ReachOutStoryLine | null {
  const item = at(timelineReading.read_at);
  if (item === null) return null;
  const until = at(timelineReading.until_at);
  const undone = timelineReading.undone ? " · undone" : "";
  const text =
    timelineReading.claim === "auto_reply" && timelineReading.intent === "away"
      ? `An automatic reply · away${until !== null ? ` until ${clockDate(until, tz, nowMs)}` : ""}${undone}`
      : `${timelineReading.claim === "owner" ? "You said they wrote back ·" : "They wrote back · read as"} ${intentWords(timelineReading.intent)}${undone}`;
  return { id: `r-${timelineReading.message_id}`, at: item, when: capitalize(clockNearWhen(item, tz, nowMs)), text };
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
  /** A drafted email's run, where its owner sends it (00429). */
  send: { label: string; to: string } | null;
  /** They wrote back…: an email its owner sent is answered in their own inbox, so they say what came back (00429). */
  said: { label: string } | null;
}

export function reachOutTimelineOf(
  leadTimeline: ReachOutLeadTimelineDto,
  nowMs: number,
  tz: string,
): ReachOutTimelineVM {
  const lines = [
    ...leadTimeline.sends.map((s) => sendLine(s, tz, nowMs)),
    ...leadTimeline.readings.map((r) => readingLine(r, tz, nowMs)),
  ].filter((x): x is ReachOutStoryLine => x !== null);
  lines.sort((a, b) => a.at - b.at);
  // A no is undone where it was read, whoever read it (the reply door's own rule: reach_out_reply_undoable).
  const undoable = leadTimeline.readings.find((r) => r.can_undo && r.intent === "no" && !r.undone) ?? null;
  const stopped = at(leadTimeline.stopped_at);
  const draftedRun = leadTimeline.sends.find((s) => s.state === "drafted" && s.run_id)?.run_id ?? null;
  // An email its owner sent from their own inbox: its answer lands there, unread by us.
  const ownerSent = leadTimeline.sends.some((s) => s.left && s.said === true);
  const answered = leadTimeline.readings.some((r) => !r.undone && r.claim !== "auto_reply");
  return {
    label: `Sequence · ${leadTimeline.chain?.name ?? leadTimeline.search?.name ?? "a sequence"}`,
    lines,
    stopped: stopped !== null ? `You stopped writing to them ${clockNear(stopped, tz, nowMs)}` : null,
    read: leadTimeline.conversation_id
      ? { label: "Read what went out", to: `inbox/th-${leadTimeline.conversation_id}` }
      : null,
    stop: leadTimeline.can_stop && leadTimeline.chain ? { label: REACH_OUT_STOP_WORDS.door } : null,
    undo: undoable
      ? { messageId: undoable.message_id, ...REACH_OUT_UNDO_WORDS[undoable.claim === "owner" ? "owner" : "read"] }
      : null,
    send: draftedRun ? { label: REACH_OUT_SAID_WORDS.sendIt, to: runRoute(draftedRun) } : null,
    said:
      ownerSent && !answered && !stopped && leadTimeline.closed_reason !== "said_no"
        ? { label: REACH_OUT_SAID_WORDS.door }
        : null,
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
export function readingEffect(r: ReachOutTimelineReadingDto): string {
  if (r.undone) return "undone";
  if (r.said_no) return "nothing more will be written";
  if (r.convert) return "the sequence stopped · Talking";
  if (r.stops) return "the sequence stopped";
  if (r.claim === "auto_reply" && r.intent === "away" && r.until_at) return "the sequence waits";
  return "nothing changed";
}
