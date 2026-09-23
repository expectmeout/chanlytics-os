/**
 * The Pipeline (docs/decisions/0008-a-proposal-is-part-of-the-deal.md): People's rows by where their deal stands, and
 * one line over them. A view of People, never a page of its own: it is made of the People surface's rows and reads
 * nothing else, and a page draws it only where deals are on (dealsAreOn).
 *
 * Four groups, in this order, and a person in one of them at most:
 *
 *   Consultations     one held in the last week with no proposal since (consultationsWithoutProposal), the oldest
 *                     first; then one coming up, the soonest first
 *   Proposal out      the one waiting longest first
 *   Clients           the newest first
 *   Passed or ended   the newest first, folded until someone opens it
 *
 * A row says who, the service, the value, how long it has stood where it is ("8 d"), and at most one chip: the one
 * thing to know about it, in warn only where something waits on the owner. The rules are deals.ts's --
 * consultationsWithoutProposal, waitingOnProposal, heardSinceProposal, amountTotalsWords -- and the words are the
 * deal's own wherever it has them (DealVM); nothing is decided twice. Every other word the Pipeline says is here, and
 * a page only composes it. Pure.
 */
import { clockDate, clockNear, clockNearWhen } from "./clock";
import { DEAL_CARD_WORDS, type DealSheetMode } from "./deal-sheet";
import {
  DEAL_STAGE_WORDS,
  amountTotalsWords,
  consultationsWithoutProposal,
  consultsHeldWords,
  heardSinceProposal,
  proposalsWaiting,
  waitingOnProposal,
  wholeDaysSince,
  type DealVM,
} from "./deals";
import type { PersonRowVM } from "./people";
import type { Tone } from "./tone";

export type PipelineGroupKey = "consultations" | "proposals" | "clients" | "closed";
/** The groups, in the order the Pipeline draws them. */
export const PIPELINE_GROUPS: readonly PipelineGroupKey[] = ["consultations", "proposals", "clients", "closed"];

/**
 * What of a People row the Pipeline reads: who, their deal as the page says it, when they last wrote or called, and
 * their consultations -- the last one's end (the rule's) and its start (the words'), and the next one.
 */
export type PipelineSource = Pick<
  PersonRowVM,
  "id" | "name" | "deal" | "askedMs" | "consultedMs" | "lastVisitMs" | "consultAhead" | "calendarTz"
>;

/** The one thing a row says beside its facts: warn where something waits on the owner, info for what is on its way, plain for a fact. */
export interface PipelineChip {
  words: string;
  tone: Extract<Tone, "warn" | "info" | "plain">;
}

export interface PipelineRowVM<T extends PipelineSource = PersonRowVM> {
  id: string;
  name: string;
  /** The People row it stands for, whole: the person cell and the phone's card draw it as People does. */
  person: T;
  /** The deal's service; null for a consultation, which has no deal yet. */
  service: string | null;
  /** The deal's value in words, "$1,200" or "$2,500 a month"; null without one. */
  value: string | null;
  /** How long it has stood where it is, "8 d"; "" for a consultation still ahead. */
  inStage: string;
  chip: PipelineChip | null;
}

export interface PipelineGroupVM<T extends PipelineSource = PersonRowVM> {
  key: PipelineGroupKey;
  label: string;
  count: number;
  /**
   * What the group comes to: the value of its proposals or its clients in all ("$4,250", "$1,340 a month"), and for
   * the consultations, how many were held in the last week with no proposal yet. Null for nothing to say.
   */
  meta: string | null;
  /** Whether it starts folded: Passed or ended does, until someone opens it (PIPELINE_WORDS.show). */
  collapsed: boolean;
  rows: PipelineRowVM<T>[];
}

export interface PipelineVM<T extends PipelineSource = PersonRowVM> {
  /**
   * The line over the table, in the parts a page sets dots between -- "3 proposals out", "$4,250", "1 waiting over a
   * week", "2 clients", "$1,340 a month" -- and only the parts that have something.
   */
  summary: string[];
  /** The groups with someone in them, in order. */
  groups: PipelineGroupVM<T>[];
  /** Nobody in any group: no deal, and no consultation to follow. */
  empty: boolean;
}

/**
 * The groups' words, the deal's own where it has them. Built inside a call marked pure, as tone.ts builds its tables:
 * the call on a stage's word is a side effect to the bundler, and a plain literal kept this table, and the deal's words
 * with it, in the channels, core, db and jobs dists, none of which draws a Pipeline.
 */
const GROUP_WORDS: Record<PipelineGroupKey, string> = /* @__PURE__ */ (() => ({
  consultations: "Consultations",
  proposals: DEAL_STAGE_WORDS.proposed,
  clients: "Clients",
  closed: `${DEAL_STAGE_WORDS.lost} or ${DEAL_STAGE_WORDS.ended.toLowerCase()}`,
}))();

/** Every word the Pipeline says that is not a row's own. */
export const PIPELINE_WORDS = {
  groups: GROUP_WORDS,
  /**
   * The table's headings, in the order it draws them. The chip's column shows none -- no one word is right for "Fri
   * 2:00 PM" and "Since Sep 18" alike -- and says this one to a screen reader.
   */
  columns: { person: "Person", service: "Service", value: "Value", stage: "In stage", chip: "Where it stands" },
  /** What opens a folded group, whose head counts its rows already, and what folds it again. */
  show: "Show",
  hide: "Hide",
  /** Where there is nobody in any group. */
  empty: { title: "No deals yet.", body: "Start a proposal from someone's page." },
  /** The two ways to see it on a desk, and what a screen reader calls the switch. A phone has the list alone. */
  views: { label: "Show as", list: "List", board: "Board" },
  /** The peek beside the rows: its two doors, its wait, and what it calls a person it could not read. */
  peek: {
    close: "Close",
    page: "Open their page",
    thread: "Open the thread",
    reading: "Reading…",
    what: "this person",
  },
  /** The board: a column with nobody in it, and what a card says of itself to a screen reader. */
  board: { nobody: "Nobody here", card: "Open" },
} as const;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const upper = (s: string): string => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : s);
/** A time in stage in words, "8 d", from the one count of whole days (wholeDaysSince); "" without one. */
const daysWords = (days: number | null): string => (days === null ? "" : `${days} d`);
/** A visit is said by the calendar's own clock, as People says it (PersonRowVM.nextVisit). */
const zoneOf = (r: PipelineSource, tz: string): string => r.calendarTz || tz;

/**
 * A proposal out's one chip, the first that holds: no link to it, nothing back in a week, heard back since, its day.
 * "Heard back", not "They wrote": what came back (`askedMs`) is the later of their last message and a call they placed.
 */
function proposalChip(r: PipelineSource, d: DealVM, tz: string, nowMs: number): PipelineChip | null {
  // Recorded with no link: an honest one (a PDF sent by email, a meeting), with nothing to send again; the deal card's
  // own words for it.
  if (!d.proposal) return { words: DEAL_CARD_WORDS.noLink, tone: "warn" };
  if (waitingOnProposal(r, nowMs)) return { words: `Nothing back in ${d.waitingDays ?? 0} d`, tone: "warn" };
  if (heardSinceProposal(r) && r.askedMs !== null)
    return { words: `Heard back ${clockNear(r.askedMs, tz, nowMs)}`, tone: "info" };
  if (d.validUntil) return { words: d.validUntil.words, tone: d.validUntil.lapsed ? "warn" : "plain" };
  return null;
}

/** A client's: since when, in the deal's own words ("Since Sep 18"). */
const clientChip = (d: DealVM): PipelineChip | null => (d.since ? { words: upper(d.since), tone: "plain" } : null);

/** Passed or ended: why they passed, else the stage's word, and the day it closed ("Price · Sep 20", "Ended · Sep 12"). */
function closedChip(d: DealVM, tz: string, nowMs: number): PipelineChip {
  const what = d.reason ? d.reason.words : d.word;
  return { words: d.sinceMs === null ? what : `${what} · ${clockDate(d.sinceMs, tz, nowMs)}`, tone: "plain" };
}

function dealRow<T extends PipelineSource>(
  r: T,
  d: DealVM,
  chip: PipelineChip | null,
  nowMs: number,
): PipelineRowVM<T> {
  return {
    id: r.id,
    name: r.name,
    person: r,
    service: d.service,
    value: d.amount,
    // A proposal's time in stage IS its wait, the number its chip says: the deal's own count, never a second one.
    inStage: daysWords(d.stage === "proposed" ? d.waitingDays : wholeDaysSince(d.sinceMs, nowMs)),
    chip,
  };
}

/**
 * A consultation held with no proposal since: when, and the step not taken yet. The rule measures from its end
 * (`consultedMs`); the words date it from its start, the day it was held, so one that took Monday reads Monday.
 */
function heldRow<T extends PipelineSource>(r: T, endMs: number, tz: string, nowMs: number): PipelineRowVM<T> {
  const heldMs = r.lastVisitMs !== null && Number.isFinite(r.lastVisitMs) ? r.lastVisitMs : endMs;
  return {
    id: r.id,
    name: r.name,
    person: r,
    service: null,
    value: null,
    inStage: daysWords(wholeDaysSince(heldMs, nowMs)),
    chip: { words: `Held ${clockNear(heldMs, zoneOf(r, tz), nowMs)} · no proposal yet`, tone: "warn" },
  };
}

/** A consultation coming up: when it is ("Fri 2:00 PM", or the day alone for one that takes the day). */
function aheadRow<T extends PipelineSource>(
  r: T,
  c: { startMs: number; allDay: boolean },
  tz: string,
  nowMs: number,
): PipelineRowVM<T> {
  const zone = zoneOf(r, tz);
  const when = c.allDay ? clockNear(c.startMs, zone, nowMs) : clockNearWhen(c.startMs, zone, nowMs);
  return {
    id: r.id,
    name: r.name,
    person: r,
    service: null,
    value: null,
    inStage: "",
    chip: { words: upper(when), tone: "info" },
  };
}

/** The earliest first, or with `latest` the latest first; a row with no moment goes last, and a tie goes by name. */
function inOrder<X extends { r: PipelineSource }>(xs: readonly X[], at: (x: X) => number | null, latest = false): X[] {
  return [...xs].sort((a, b) => {
    const x = at(a);
    const y = at(b);
    if (x === y) return a.r.name.localeCompare(b.r.name) || a.r.id.localeCompare(b.r.id);
    if (x === null) return 1;
    if (y === null) return -1;
    return latest ? y - x : x - y;
  });
}

/** What some deals come to in all, summed by how each recurs (amountTotalsWords); null when none has an amount. */
const worth = (xs: readonly { d: DealVM }[]): string | null =>
  amountTotalsWords(xs.map((x) => ({ amount_cents: x.d.amountCents, per: x.d.per, currency: x.d.currency })));

/**
 * The Pipeline of these rows: the line over it, its groups and their rows, and whether it is empty. `rows` are People's
 * (PersonRowVM, as the People surface publishes them where deals are on); `tz` is the workspace's zone.
 */
export function pipelineOf<T extends PipelineSource>(rows: readonly T[], nowMs: number, tz: string): PipelineVM<T> {
  // Held with no proposal since, in the rule's own order (the oldest first): the group lists them as the rule gives
  // them, and Today names the first two of the same list. Nobody in it has an open deal, so nobody is in two groups.
  const held = consultationsWithoutProposal(rows, nowMs);
  const heldSet = new Set<T>(held);
  const ahead: { r: T; c: { startMs: number; allDay: boolean } }[] = [];
  const proposals: { r: T; d: DealVM }[] = [];
  const clients: { r: T; d: DealVM }[] = [];
  const closed: { r: T; d: DealVM }[] = [];
  for (const r of rows) {
    if (heldSet.has(r)) continue;
    const d = r.deal;
    if (d && d.stage === "proposed") proposals.push({ r, d });
    else if (d && d.stage === "won") clients.push({ r, d });
    // A consultation ahead of someone with nothing open: something new begins, whatever they passed on or ended before.
    else if (r.consultAhead) ahead.push({ r, c: r.consultAhead });
    else if (d) closed.push({ r, d });
  }
  const group = (key: PipelineGroupKey, rs: PipelineRowVM<T>[], meta: string | null): PipelineGroupVM<T> => ({
    key,
    label: GROUP_WORDS[key],
    count: rs.length,
    meta,
    collapsed: key === "closed",
    rows: rs,
  });
  const groups = [
    group(
      "consultations",
      [
        ...held.map((r) => heldRow(r, r.consultedMs as number, tz, nowMs)),
        ...inOrder(ahead, (x) => x.c.startMs).map((x) => aheadRow(x.r, x.c, tz, nowMs)),
      ],
      // One sentence, which Today's row re-prints word for word (consultsHeldWords).
      held.length ? consultsHeldWords(held.length) : null,
    ),
    group(
      "proposals",
      inOrder(proposals, (x) => x.d.sinceMs).map((x) => dealRow(x.r, x.d, proposalChip(x.r, x.d, tz, nowMs), nowMs)),
      worth(proposals),
    ),
    group(
      "clients",
      inOrder(clients, (x) => x.d.sinceMs, true).map((x) => dealRow(x.r, x.d, clientChip(x.d), nowMs)),
      worth(clients),
    ),
    group(
      "closed",
      inOrder(closed, (x) => x.d.sinceMs, true).map((x) => dealRow(x.r, x.d, closedChip(x.d, tz, nowMs), nowMs)),
      null,
    ),
  ].filter((g) => g.count > 0);
  const waiting = proposalsWaiting(
    proposals.map((x) => x.r),
    nowMs,
  ).length;
  const summary = [
    proposals.length ? `${plural(proposals.length, "proposal", "proposals")} out` : null,
    proposals.length ? worth(proposals) : null,
    waiting ? `${waiting} waiting over a week` : null,
    clients.length ? plural(clients.length, "client", "clients") : null,
    clients.length ? worth(clients) : null,
  ].filter((x): x is string => !!x);
  return { summary, groups, empty: groups.length === 0 };
}

/* ------------------------------------------------ the Pipeline as a workspace: the peek and the board's moves */

/** What a card dropped in another column asks for: the one deal sheet, in the mode the move needs (0008). */
export interface PipelineMove {
  mode: DealSheetMode;
  /** The deal the move is about; null for a new proposal. */
  dealId: string | null;
}

/**
 * What dropping a card from one group into another means, or null where it means nothing. A consultation into
 * Proposal out starts a proposal; a proposal into Clients is a yes, into Passed or ended a pass; a client into Passed
 * or ended is an end; a passed deal back into Proposal out is proposed again, and an ended one begins a new proposal.
 * Nothing else moves, and nothing moves without the sheet: a drop is a person's confirmation, never the record
 * itself, so the sheet still asks what the move needs (the amount, the reason, the day).
 */
export function pipelineMove(
  from: PipelineGroupKey,
  to: PipelineGroupKey,
  row: { person: Pick<PipelineSource, "deal"> },
): PipelineMove | null {
  if (from === to) return null;
  const deal = row.person.deal;
  if (from === "consultations" && to === "proposals") return { mode: "propose", dealId: null };
  if (from === "proposals" && deal?.stage === "proposed") {
    if (to === "clients") return { mode: "won", dealId: deal.id };
    if (to === "closed") return { mode: "lost", dealId: deal.id };
  }
  if (from === "clients" && to === "closed" && deal?.stage === "won") return { mode: "ended", dealId: deal.id };
  if (from === "closed" && to === "proposals" && deal)
    return deal.stage === "lost" ? { mode: "again", dealId: deal.id } : { mode: "propose", dealId: null };
  return null;
}

/** One quiet fact under the peek's deal: when they were last heard, their words, or what is coming up. */
export interface PipelinePeekFact {
  id: "heard" | "quote" | "next";
  words: string;
}

/** The peek beside the rows: who, where they stand, and the facts People already says of them. */
export interface PipelinePeekVM {
  id: string;
  name: string;
  initials: string;
  /** Whether the name is a number or an address, drawn in figures. */
  numeric: boolean;
  /** The group and the deal's service: "Proposal out · Bridal package", "Consultations". */
  sub: string;
  facts: PipelinePeekFact[];
  /** Their thread's id ("th-…"), for the door to it; null for someone with no conversation. */
  thread: string | null;
}

/**
 * What the peek says of a row before the person is read: the head from the row alone, and the facts People's row
 * already carries, so the peek stands the moment it opens and the deal card fills in as the person lands.
 */
export function pipelinePeekOf(row: PipelineRowVM, group: PipelineGroupKey): PipelinePeekVM {
  const p = row.person;
  const facts: PipelinePeekFact[] = [];
  if (p.lastContact.label) facts.push({ id: "heard", words: p.lastContact.label });
  if (p.quote) facts.push({ id: "quote", words: `“${p.quote}”` });
  if (p.nextVisit) facts.push({ id: "next", words: `Coming up · ${p.nextVisit}` });
  return {
    id: row.id,
    name: row.name,
    initials: p.initials,
    numeric: /^[+\d(]/.test(row.name) || row.name.includes("@"),
    sub: row.service ? `${GROUP_WORDS[group]} · ${row.service}` : GROUP_WORDS[group],
    facts,
    thread: p.threadId,
  };
}
