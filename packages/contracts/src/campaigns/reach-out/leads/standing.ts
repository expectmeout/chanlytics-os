/** Leads: standing. */

import { clockDate, clockHour, clockNearWhen } from "../../../shared/clock";
import { capitalize, plural } from "../../../shared/words";
import { LEAD_FIT_WORDS, LEAD_STAGE_WORDS } from "../../../leads/words/lists";
import { localDate, localHour } from "../../playbooks/schedule";
import { PLAYBOOK_HOURS } from "../../playbooks/triggers/kinds";
import { leadFoundWords } from "../../../leads/kind";
import type { ReachOutPeopleCountsDto } from "../dtos";
import {
  at,
  emailWords,
  intentWords,
  near,
  personAnswered,
  readingEffect,
  stepName,
  type ReachOutFedBy,
  type ReachOutLeadLineDto,
  type ReachOutLeadTimelineDto,
  type ReachOutPersonVM,
  type ReachOutTimelineChainDto,
  type ReachOutTimelineReadingDto,
  writtenWords,
} from "./lines";

/**
 * The line under a lead's stage while a reach-out writes (H8), or null when the chain has done nothing with it. The
 * first that holds: booked and won (00426), their reply as read, said no, bounced, stopped, away, written (with its
 * nudges and what is next), held, planned, handed.
 */
export function reachOutLineOf(reachOutLeadLine: ReachOutLeadLineDto, nowMs: number, tz: string): string | null {
  const booked = at(reachOutLeadLine.booked_at);
  const won = at(reachOutLeadLine.won_at ?? null);
  if (won !== null)
    return `${booked !== null ? `Booked ${clockDate(booked, tz, nowMs)} · won` : "Won"} ${clockDate(won, tz, nowMs)}`;
  if (booked !== null) return `Booked ${clockNearWhen(booked, tz, nowMs)}`;
  const reply = reachOutLeadLine.reply;
  if (personAnswered(reply)) {
    if (reply.intent === "no") return `Said no ${near(reply.read_at, tz, nowMs)}`;
    const resume = at(reachOutLeadLine.resume_at);
    // Their own day, come: back to write to by hand (decision 9 of the workbench: no reach-out writes to them twice).
    if (reply.intent === "not_now" && resume !== null && resume <= nowMs)
      return `Back · asked to hear from you ${askedDayOf(resume, tz, nowMs)}`;
    if (reply.intent === "not_now" && resume !== null) return `Not now · until ${clockDate(resume, tz, nowMs)}`;
    if (reply.intent === "away" && resume !== null) return `Away · back ${clockDate(resume, tz, nowMs)}`;
    return `Wrote back ${near(reply.read_at, tz, nowMs)} · ${intentWords(reply.intent)}`;
  }
  if (reachOutLeadLine.closed_reason === "said_no") return "Said no";
  if (reachOutLeadLine.bounced)
    return `Bounced ${near(reachOutLeadLine.bounced_at, tz, nowMs)}${reachOutLeadLine.email_state === "invalid" ? " · address dropped" : ""}`;
  if (reachOutLeadLine.stopped_at) return `Stopped ${near(reachOutLeadLine.stopped_at, tz, nowMs)}`;
  const away = at(reachOutLeadLine.away_until);
  if (reachOutLeadLine.sent > 0 && away !== null && away > nowMs)
    return `Written ${near(reachOutLeadLine.first_sent_at, tz, nowMs)} · away until ${clockDate(away, tz, nowMs)}`;
  if (reachOutLeadLine.sent > 0) return writtenWords(reachOutLeadLine, tz, nowMs);
  if (reachOutLeadLine.held) return "Held for your OK";
  // Handed to its owner, written and checked (00429): it waits for them to send it from their inbox.
  if ((reachOutLeadLine.drafted ?? 0) > 0) return "Drafted for you · to send from your inbox";
  const next = at(reachOutLeadLine.next_at);
  if (next !== null) return capitalize(clockNearWhen(next, tz, nowMs));
  if (reachOutLeadLine.handed) return "Handed to you";
  if (reachOutLeadLine.added_at) return `Added ${near(reachOutLeadLine.added_at, tz, nowMs)} · not written yet`;
  return null;
}

/** A lead's stage in the Leads page's words: Ready, Contacted, Talking, Closed. */
const stageWords = (stage: string): string =>
  stage in LEAD_STAGE_WORDS ? LEAD_STAGE_WORDS[stage as keyof typeof LEAD_STAGE_WORDS] : stage;

export function reachOutPersonOf(leadTimeline: ReachOutLeadTimelineDto, nowMs: number, tz: string): ReachOutPersonVM {
  const chain = leadTimeline.chain?.name ?? null;
  const emails = new Map<string, { who: string; sub: string }>();
  for (const s of leadTimeline.sends) {
    if (!s.left || !s.message_id) continue;
    const parts = [stepName(s.n, s.hand)];
    if (s.angle) parts.push(`angle: ${s.angle}`);
    if (s.from || s.host) parts.push(`from ${s.from ?? s.host}`);
    else if (s.said) parts.push("from your inbox");
    parts.push(emailWords(s));
    emails.set(s.message_id, { who: chain ? `Sequence · ${chain}` : "Your sequence", sub: parts.join(" · ") });
  }
  const readings = new Map<string, string>();
  for (const r of leadTimeline.readings)
    readings.set(
      r.message_id,
      `${r.claim === "owner" ? "You said" : "Read as"} ${intentWords(r.intent)} · ${readingEffect(r)}`,
    );
  const foundAt = at(leadTimeline.found_at);
  const fit =
    leadTimeline.search?.fit && leadTimeline.search.fit in LEAD_FIT_WORDS
      ? LEAD_FIT_WORDS[leadTimeline.search.fit as keyof typeof LEAD_FIT_WORDS]
      : null;
  const found =
    foundAt !== null
      ? {
          at: foundAt,
          text: [
            leadFoundWords(leadTimeline),
            fit ? fit.toLowerCase() : null,
            leadTimeline.email_state === "ok" ? "address checked" : null,
          ]
            .filter(Boolean)
            .join(" · "),
        }
      : null;
  return {
    emails,
    readings,
    found,
    about: leadTimeline.chain
      ? `${leadTimeline.chain.name} · ${stageWords(leadTimeline.stage)} · ${reachOutStandingOf(leadTimeline, nowMs, tz)?.words ?? "not written yet"}`
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
 * When a lead nothing was written to yet goes: with its sequence's batch for the day, never at a minute the batch has not
 * chosen (the timetable places each email in its business's hours). A batch that waits for its owner, a paused
 * sequence, today's batch still to come, the next hourly sweep (today's not made: an add after the hour is planned
 * then, 00426), or tomorrow's (today's made, or the day's last hour gone). A sequence whose batches ask says so.
 */
export function reachOutWhenOf(timelineChain: ReachOutTimelineChainDto, nowMs: number, tz: string): string {
  if (timelineChain.waiting_run_id) return "waits for your OK";
  if (timelineChain.state !== "running") return "nothing goes while it is paused";
  const hour = timelineChain.run_hour ?? PLAYBOOK_HOURS.min;
  const now = new Date(nowMs);
  const result = localHour(tz, now);
  const say = timelineChain.asks ? ", after your OK" : "";
  if (timelineChain.last_run_for === localDate(tz, now) || result > PLAYBOOK_HOURS.max)
    return `goes tomorrow from ${clockHour(hour)}${say}`;
  if (result < hour) return `goes today from ${clockHour(hour)}${say}`;
  return `goes within the hour${say}`;
}

/** What a person's answer did, after "wrote back Thu · interested". */
function answerStanding(
  timelineReading: ReachOutTimelineReadingDto,
  tz: string,
  nowMs: number,
  resume: number | null,
): ReachOutStandingVM {
  if (timelineReading.said_no || timelineReading.intent === "no")
    return standing(`said no ${near(timelineReading.read_at, tz, nowMs)} · nothing more will be written`, "bad", false);
  // Not now, and their day has come: Leads' Back today, written to by hand (decision 9 of the workbench).
  if (timelineReading.intent === "not_now" && resume !== null && resume <= nowMs)
    return standing(`asked to hear from you ${askedDayOf(resume, tz, nowMs)} · write to them yourself`, "warn", false);
  const text = `wrote back ${near(timelineReading.read_at, tz, nowMs)} · ${intentWords(timelineReading.intent)}`;
  return standing(
    timelineReading.stops || timelineReading.convert ? `${text} · the sequence stopped` : text,
    "good",
    false,
  );
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
function writtenStanding(leadTimeline: ReachOutLeadTimelineDto, tz: string, nowMs: number): ReachOutStandingVM | null {
  const left = leadTimeline.sends.filter((s) => s.left && s.n !== null);
  const steps = leadTimeline.chain?.steps?.filter((s) => !s.hand).length ?? 0;
  const held = leadTimeline.sends.some((s) => s.state === "held");
  const drafted = leadTimeline.sends.some((s) => s.state === "drafted");
  const planned = nextPlanned(leadTimeline);
  if (left.length === 0) {
    if (held) return standing("email 1 waits for your OK", "warn", false);
    if (drafted) return standing("email 1 is handed to you to send", "warn", false);
    if (planned !== null) return standing(`email 1 goes ${clockNearWhen(planned, tz, nowMs)}`, "plain", false);
    return null;
  }
  const last = left.at(-1);
  const key = (last?.n ?? 0) + 1;
  const parts = [
    `${steps >= key ? `email ${key} of ${steps} sent` : "written"} ${near(last?.sent_at ?? null, tz, nowMs)}`,
  ];
  if (held) parts.push("the next waits for your OK");
  else if (drafted) parts.push("the next is handed to you to send");
  else if (planned !== null) parts.push(`next ${clockNearWhen(planned, tz, nowMs)}`);
  else if (steps > key) parts.push("the next if nothing comes back");
  else parts.push("the last email");
  return standing(parts.join(" · "), "plain", leadTimeline.can_stop);
}

/**
 * Where a lead stands in its reach-out, the first that holds: booked; a person's answer (an automatic reply is not one:
 * away only pauses it); said no; stopped; bounced; away; its emails so far and what is next; not written yet, with when
 * it goes. Null for a lead with no reach-out.
 */
export function reachOutStandingOf(
  leadTimeline: ReachOutLeadTimelineDto,
  nowMs: number,
  tz: string,
): ReachOutStandingVM | null {
  if (!leadTimeline.chain) return null;
  const booked = at(leadTimeline.booked_at);
  const won = at(leadTimeline.won_at ?? null);
  if (won !== null)
    return standing(
      `${booked !== null ? `booked ${clockDate(booked, tz, nowMs)} · ` : ""}won ${clockDate(won, tz, nowMs)}`,
      "good",
      false,
    );
  if (booked !== null) return standing(`booked ${clockNearWhen(booked, tz, nowMs)}`, "good", false);
  const person = leadTimeline.readings.find((r) => !r.undone && r.claim !== "auto_reply") ?? null;
  if (person) return answerStanding(person, tz, nowMs, at(leadTimeline.resume_at));
  if (leadTimeline.closed_reason === "said_no") return standing("said no · nothing more will be written", "bad", false);
  if (leadTimeline.stopped_at)
    return standing(`you stopped writing to them ${near(leadTimeline.stopped_at, tz, nowMs)}`, "plain", false);
  if (leadTimeline.sends.some((s) => s.bounced))
    return standing("bounced · nothing more will be written", "bad", false);
  const away = leadTimeline.readings.find((r) => !r.undone && r.intent === "away" && at(r.until_at) !== null);
  const back = away ? at(away.until_at) : null;
  if (back !== null && back > nowMs)
    return standing(`away until ${clockDate(back, tz, nowMs)} · the sequence waits`, "plain", leadTimeline.can_stop);
  const written = writtenStanding(leadTimeline, tz, nowMs);
  if (written) return written;
  const added = leadTimeline.added_at ? `added ${near(leadTimeline.added_at, tz, nowMs)} · ` : "";
  const when = reachOutWhenOf(leadTimeline.chain, nowMs, tz);
  return standing(`${added}not written yet · ${when}`, leadTimeline.chain.waiting_run_id ? "warn" : "plain", false);
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
  elsewhere: "in another sequence",
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
  listGone: "That sequence's list was removed, so nothing can be added to it.",
  fedBySearch: "That sequence writes to its search's leads as they're found, so leads aren't added to it by hand.",
  door: "Add to its sequence",
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
function leftOutWords(reachOutAdd: ReachOutAddDto): string[] {
  const named = reachOutAdd.leads.filter((l) => l.why === "elsewhere" && l.chain_name);
  const one = named.length === 1 ? named.at(0)?.chain_name : null;
  return Object.entries(reachOutAdd.left_out)
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
  reachOutAdd: ReachOutAddDto,
  chainName: string,
): { text: string; tone: "good" | "warn" | "plain" } {
  const joined = reachOutAdd.dry ? (reachOutAdd.would_add ?? 0) : reachOutAdd.added;
  const left = Object.values(reachOutAdd.left_out).reduce<number>((n, x) => n + (x ?? 0), 0);
  const head =
    joined === 0
      ? `None can be added to “${chainName}”`
      : `${reachOutAdd.dry ? "Adds" : "Added"} ${plural(joined, "lead", "leads")} to “${chainName}”`;
  return {
    text: left > 0 ? `${head} · ${left} left out: ${leftOutWords(reachOutAdd).join(", ")}` : head,
    tone: joined === 0 ? "warn" : reachOutAdd.dry ? "plain" : "good",
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
export function reachOutCameWords(
  chainPeople: Pick<ReachOutChainPeopleDto, "counts" | "came" | "fed_by">,
): string | null {
  const c = chainPeople.came;
  if (!c) return null;
  const found = `${chainPeople.counts.of} ${chainPeople.fed_by === "list" ? "on its list" : "found"}`;
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
