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
  DEAL_LOST_REASONS,
  DEAL_LOST_REASON_WORDS,
  DEAL_STAGE_WORDS,
  amountTotalsWords,
  consultationsWithoutProposal,
  consultsHeldWords,
  dealIsOpen,
  heardSinceProposal,
  proposalsWaiting,
  waitingOnProposal,
  wholeDaysSince,
  type DealLostReason,
  type DealPaceVM,
  type DealVM,
} from "./deals";
import { repliesWords, type PersonRowVM, type PersonVM } from "./people";
import { stepDayOf, stepIsDue, type StepDue } from "./steps";
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
  "id" | "name" | "deal" | "askedMs" | "consultedMs" | "lastVisitMs" | "consultAhead" | "calendarTz" | "nextStep"
>;

/** The one thing a row says beside its facts: warn where something waits on the owner, info for what is on its way, plain for a fact. */
export interface PipelineChip {
  words: string;
  tone: Extract<Tone, "warn" | "info" | "plain">;
}

export interface PipelineRowVM<T extends PipelineSource = PersonRowVM> {
  id: string;
  /** The group it is drawn in: what its menu offers is the group's (a consultation starts a proposal). */
  group: PipelineGroupKey;
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
  /**
   * The deal's steps, as the row, the card and the peek draw them: a consultation where one was held or is coming
   * up, the proposal, the client. Empty for a pass or an end, whose chip says it. A picture of what the group head
   * and the chip say in words, so a screen reader is not read it again.
   */
  track: PipelineStep[];
  /**
   * Their next step (0007, amended): the earliest open note with a day, as People's row carries it, its day judged
   * again as the Pipeline is drawn. Null without one.
   */
  next: PipelineNextVM | null;
}

/** A row's next step, as its column, its card and the peek say it. */
export interface PipelineNextVM {
  id: string;
  words: string;
  /** The day itself, "2026-09-26", for the order; `when` is how it is said: "Due Thu", "Overdue since Mon". */
  day: string;
  when: string;
  due: StepDue;
  forWho: string | null;
  /** The deal it moves, when it names one. */
  dealId: string | null;
}

/** One step on a row's track: done, where the deal stands now, or still ahead. */
export interface PipelineStep {
  key: "consultation" | "proposal" | "client";
  at: "done" | "current" | "ahead";
  /** Where it stands, in the tone its chip is in (a proposal waiting on the owner is warn); plain either side of it. */
  tone: Extract<Tone, "info" | "ok" | "warn" | "plain">;
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

/**
 * One part of the line over the table: its words, and the view a press on it opens (the rail's own row), in warn where
 * it counts what waits on the owner. The totals are words only.
 */
export interface PipelineLinePart {
  words: string;
  view: PipelineView | null;
  tone: "warn" | null;
}

export interface PipelineVM<T extends PipelineSource = PersonRowVM> {
  /**
   * The line over the table, in the parts a page sets dots between -- "3 proposals out", "$4,250", "1 waiting over a
   * week", "1 lapsed", "2 clients", "$1,340 a month" -- and only the parts that have something. Always the whole
   * Pipeline's, whatever view the groups are of.
   */
  summary: string[];
  /** The same parts, with the view each opens. */
  line: PipelineLinePart[];
  /** The groups with someone in them, in order. */
  groups: PipelineGroupVM<T>[];
  /** Nobody in any group: no deal, and no consultation to follow. */
  empty: boolean;
  /** The workspace's pace (dealPaceOf), which every wait on this Pipeline was judged by; null without one. */
  pace: DealPaceVM | null;
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
  columns: {
    person: "Person",
    service: "Service",
    value: "Value",
    stage: "Stage",
    came: "Came from",
    valid: "Valid until",
    // The notes card's own words (NOTE_WORDS.next), written out: read off it, this table would be kept in every
    // package that bundles contracts, as GROUP_WORDS would (pipeline.test.mjs holds the two together).
    next: "Next step",
    chip: "Where it stands",
    /** The row's own menu, as a screen reader hears its heading. */
    acts: "More",
  },
  /** What opens a folded group, whose head counts its rows already, and what folds it again. */
  show: "Show",
  hide: "Hide",
  /** Where there is nobody in any group. */
  empty: { title: "No deals yet.", body: "Proposals you start show here, with what they come to." },
  /** The two ways to see it on a desk, and what a screen reader calls the switch. A phone has the list alone. */
  views: { label: "Show as", list: "List", board: "Board" },
  /** The peek beside the rows: its two doors, its wait, and what it calls a person it could not read. */
  peek: {
    close: "Close",
    page: "Open their page",
    thread: "Open the thread",
    reading: "Reading…",
    what: "this person",
    /** How to reach them: the number (a call, a copy), the address (a copy), and what a reply may be. */
    reach: {
      phone: "Phone",
      email: "Email",
      replies: "Replies",
      call: "Call",
      copy: "Copy",
      copied: "Copied",
      /** What a Copy says it copies, to a screen reader: both buttons read "Copy" on the page. */
      copyPhone: "Copy the number",
      copyEmail: "Copy the address",
    },
    /** What happened with their deals, newest first. */
    history: "History",
  },
  /** The board: a column with nobody in it, what a card says of itself to a screen reader, and a card's menu. */
  board: { nobody: "Nobody here", card: "Open", menu: "More for", move: "Move to" },
  /** The row's menu: the deal's own acts come from the deal sheet's words; these are its two doors. */
  row: { menu: "More for" },
  /** A selection's pass (Mark as passed · N): the one question, asked once for every proposal in it. */
  pass: {
    button: "Mark as passed",
    ask: "Why did they pass?",
    cancel: "Cancel",
    busy: "Marking…",
  },
  /** A proposal out waiting with nothing back (waitingOnProposal): the row's In stage already says how long. */
  nothingBack: "Nothing back",
  /**
   * The line's part for the proposals waiting: past a week; past the workspace's pace once it has one; and past the
   * cap in its days, where thirty holds the wait at or under the pace and "longer than usual" would not be so.
   */
  waitingLine: (n: number, pace: DealPaceVM | null) =>
    !pace
      ? `${n} waiting over a week`
      : pace.longerThanUsual
        ? `${n} waiting longer than usual`
        : `${n} waiting over ${pace.waitDays} days`,
  /** The Pipeline's own rail: its groups, what waits on the owner, and each service. */
  rail: {
    /** A phone's sheet of the rail's rows, behind the bar's list button. */
    sheet: "Show",
    deals: "Deals",
    all: "All deals",
    waitingOnYou: "Waiting on you",
    waiting: "Nothing back in a week",
    /** The same, once the workspace has a pace: past it by a fifth (waitAfterDays). */
    waitingPaced: (days: number) => `Nothing back in ${days} days`,
    lapsed: "Lapsed",
    // A next step whose day has come (NOTE_WORDS.stepsDue, written out for the same reason).
    steps: "Steps due",
    services: "Services",
  },
  /** New proposal: the button, and the picker it opens before the deal sheet. */
  newProposal: {
    button: "New proposal",
    title: "New proposal",
    sub: "Who is it for?",
    search: "Search people",
    none: "No one matches.",
    add: "Add someone new",
    name: "Name",
    optional: "optional",
    number: "Mobile number",
    go: "Continue",
    adding: "Adding…",
  },
} as const;

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const upper = (s: string): string => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : s);
/** A time in stage in words, "8 d", from the one count of whole days (wholeDaysSince); "" without one. */
const daysWords = (days: number | null): string => (days === null ? "" : `${days} d`);
/** A visit is said by the calendar's own clock, as People says it (PersonRowVM.nextVisit). */
const zoneOf = (r: PipelineSource, tz: string): string => r.calendarTz || tz;

/**
 * A proposal out's one chip, the first that holds: nothing back in a week, heard back since, its day, no link to it.
 * "Heard back", not "They wrote": what came back (`askedMs`) is the later of their last message and a call they placed.
 * The wait is said once: its number is the row's In stage, so the chip says "Nothing back" and no figure.
 */
function proposalChip(
  r: PipelineSource,
  d: DealVM,
  tz: string,
  nowMs: number,
  pace: DealPaceVM | null,
): PipelineChip | null {
  if (waitingOnProposal(r, nowMs, pace)) return { words: PIPELINE_WORDS.nothingBack, tone: "warn" };
  if (heardSinceProposal(r) && r.askedMs !== null)
    return { words: `Heard back ${clockNear(r.askedMs, tz, nowMs)}`, tone: "info" };
  if (d.validUntil) return { words: d.validUntil.words, tone: d.validUntil.lapsed ? "warn" : "plain" };
  // Recorded with no link: an honest one (a PDF sent by email, a meeting), so a fact at rest, never a warning (0008);
  // the deal card's own words for it.
  if (!d.proposal) return { words: DEAL_CARD_WORDS.noLink, tone: "plain" };
  return null;
}

/** A client's: since when, in the deal's own words ("Since Sep 18"). */
const clientChip = (d: DealVM): PipelineChip | null => (d.since ? { words: upper(d.since), tone: "plain" } : null);

/** Passed or ended: why they passed, else the stage's word, and the day it closed ("Price · Sep 20", "Ended · Sep 12"). */
function closedChip(d: DealVM, tz: string, nowMs: number): PipelineChip {
  const what = d.reason ? d.reason.words : d.word;
  return { words: d.sinceMs === null ? what : `${what} · ${clockDate(d.sinceMs, tz, nowMs)}`, tone: "plain" };
}

const step = (
  key: PipelineStep["key"],
  at: PipelineStep["at"],
  tone: PipelineStep["tone"] = "plain",
): PipelineStep => ({
  key,
  at,
  tone,
});

/**
 * A deal's steps: the consultation where one was held, then the proposal and the client -- a proposal out is where it
 * stands, in its chip's warn when it waits on the owner; a client has come through both. A pass or an end has none.
 */
function dealTrack(r: PipelineSource, d: DealVM, chip: PipelineChip | null): PipelineStep[] {
  if (d.stage !== "proposed" && d.stage !== "won") return [];
  const held = r.consultedMs !== null && Number.isFinite(r.consultedMs) ? [step("consultation", "done")] : [];
  return d.stage === "proposed"
    ? [...held, step("proposal", "current", chip?.tone === "warn" ? "warn" : "info"), step("client", "ahead")]
    : [...held, step("proposal", "done"), step("client", "current", "ok")];
}

/** A row as its group's builder makes it; the group gives it its next step (pipelineOf). */
type PipelineRowBody<T extends PipelineSource> = Omit<PipelineRowVM<T>, "next">;

/** A row's next step, from People's row, its day judged again at `nowMs`; null without one. */
function nextOf(p: PipelineSource, tz: string, nowMs: number): PipelineNextVM | null {
  const s = p.nextStep;
  if (!s) return null;
  const day = stepDayOf(s.day.day, tz, nowMs);
  if (!day) return null;
  return { id: s.id, words: s.words, day: day.day, when: day.words, due: day.due, forWho: s.forWho, dealId: s.dealId };
}

/** A row whose next step's day has come: today, or before it. */
const stepDue = (r: { next: PipelineNextVM | null }): boolean => stepIsDue(r.next);

function dealRow<T extends PipelineSource>(
  r: T,
  d: DealVM,
  chip: PipelineChip | null,
  nowMs: number,
  group: PipelineGroupKey,
): PipelineRowBody<T> {
  return {
    id: r.id,
    group,
    name: r.name,
    person: r,
    service: d.service,
    value: d.amount,
    // A proposal's time in stage IS its wait, the number its chip says: the deal's own count, never a second one.
    inStage: daysWords(d.stage === "proposed" ? d.waitingDays : wholeDaysSince(d.sinceMs, nowMs)),
    chip,
    track: dealTrack(r, d, chip),
  };
}

/**
 * A consultation held with no proposal since: when, and the step not taken yet. The rule measures from its end
 * (`consultedMs`); the words date it from its start, the day it was held, so one that took Monday reads Monday.
 */
function heldRow<T extends PipelineSource>(r: T, endMs: number, tz: string, nowMs: number): PipelineRowBody<T> {
  const heldMs = r.lastVisitMs !== null && Number.isFinite(r.lastVisitMs) ? r.lastVisitMs : endMs;
  return {
    id: r.id,
    group: "consultations",
    name: r.name,
    person: r,
    service: null,
    value: null,
    inStage: daysWords(wholeDaysSince(heldMs, nowMs)),
    chip: { words: `Held ${clockNear(heldMs, zoneOf(r, tz), nowMs)} · no proposal yet`, tone: "warn" },
    // Held, and the proposal is the step now: in warn, as the chip says it, since it waits on the owner.
    track: [step("consultation", "done"), step("proposal", "current", "warn"), step("client", "ahead")],
  };
}

/** A consultation coming up: when it is ("Fri 2:00 PM", or the day alone for one that takes the day). */
function aheadRow<T extends PipelineSource>(
  r: T,
  c: { startMs: number; allDay: boolean },
  tz: string,
  nowMs: number,
): PipelineRowBody<T> {
  const zone = zoneOf(r, tz);
  const when = c.allDay ? clockNear(c.startMs, zone, nowMs) : clockNearWhen(c.startMs, zone, nowMs);
  return {
    id: r.id,
    group: "consultations",
    name: r.name,
    person: r,
    service: null,
    value: null,
    inStage: "",
    chip: { words: upper(when), tone: "info" },
    track: [step("consultation", "current", "info"), step("proposal", "ahead"), step("client", "ahead")],
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
 * (PersonRowVM, as the People surface publishes them where deals are on); `tz` is the workspace's zone; `pace` is its
 * pace (dealPaceOf, null without one), which says when a proposal out is waiting. `view` is the rail's pick: the
 * groups hold only its rows, and the line stays the whole Pipeline's.
 */
export function pipelineOf<T extends PipelineSource>(
  rows: readonly T[],
  nowMs: number,
  tz: string,
  pace: DealPaceVM | null,
  view: PipelineView = "all",
): PipelineVM<T> {
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
  const lapsed = proposals.filter((x) => !!x.d.validUntil?.lapsed);
  const waiting = proposalsWaiting(
    proposals.map((x) => x.r),
    nowMs,
    pace,
  ).length;
  // What the view shows: one group, what waits on the owner, or one service's deals. A consultation has no deal yet,
  // so no service; it shows under its own group and under All deals.
  const svc = serviceOf(view);
  const shows = (key: PipelineGroupKey): boolean =>
    view === "all" ||
    view === "steps" ||
    view === key ||
    svc !== null ||
    ((view === "waiting" || view === "lapsed") && key === "proposals");
  const bySvc = <X extends { d: DealVM }>(xs: X[]): X[] => (svc === null ? xs : xs.filter((x) => x.d.service === svc));
  const shownHeld = shows("consultations") && svc === null ? held : [];
  const shownAhead = shows("consultations") && svc === null ? ahead : [];
  const shownProposals = !shows("proposals")
    ? []
    : view === "waiting"
      ? proposals.filter((x) => waitingOnProposal(x.r, nowMs, pace))
      : view === "lapsed"
        ? lapsed
        : bySvc(proposals);
  const shownClients = shows("clients") ? bySvc(clients) : [];
  const shownClosed = shows("closed") ? bySvc(closed) : [];
  // Each row with its next step, its day said against now; under Steps due, only the rows whose step's day has come,
  // and a group's meta (what its deals come to) is the whole group's, so it is not said of a part of it.
  const group = (key: PipelineGroupKey, body: PipelineRowBody<T>[], meta: string | null): PipelineGroupVM<T> => {
    const all = body.map((x) => ({ ...x, next: nextOf(x.person, tz, nowMs) }));
    const rs = view === "steps" ? all.filter(stepDue) : all;
    return {
      key,
      label: GROUP_WORDS[key],
      count: rs.length,
      meta: view === "steps" ? null : meta,
      // Folded on the whole Pipeline only: a view someone picked shows what they picked.
      collapsed: key === "closed" && view === "all",
      rows: rs,
    };
  };
  const groups = [
    group(
      "consultations",
      [
        ...shownHeld.map((r) => heldRow(r, r.consultedMs as number, tz, nowMs)),
        ...inOrder(shownAhead, (x) => x.c.startMs).map((x) => aheadRow(x.r, x.c, tz, nowMs)),
      ],
      // One sentence, which Today's row re-prints word for word (consultsHeldWords).
      shownHeld.length ? consultsHeldWords(shownHeld.length) : null,
    ),
    group(
      "proposals",
      inOrder(shownProposals, (x) => x.d.sinceMs).map((x) =>
        dealRow(x.r, x.d, proposalChip(x.r, x.d, tz, nowMs, pace), nowMs, "proposals"),
      ),
      worth(shownProposals),
    ),
    group(
      "clients",
      inOrder(shownClients, (x) => x.d.sinceMs, true).map((x) => dealRow(x.r, x.d, clientChip(x.d), nowMs, "clients")),
      worth(shownClients),
    ),
    group(
      "closed",
      inOrder(shownClosed, (x) => x.d.sinceMs, true).map((x) =>
        dealRow(x.r, x.d, closedChip(x.d, tz, nowMs), nowMs, "closed"),
      ),
      null,
    ),
  ].filter((g) => g.count > 0);
  const part = (words: string | null, press: PipelineView | null = null): PipelineLinePart | null =>
    words ? { words, view: press, tone: press ? "warn" : null } : null;
  const line = [
    part(proposals.length ? `${plural(proposals.length, "proposal", "proposals")} out` : null),
    part(proposals.length ? worth(proposals) : null),
    part(waiting ? PIPELINE_WORDS.waitingLine(waiting, pace) : null, "waiting"),
    part(lapsed.length ? `${lapsed.length} lapsed` : null, "lapsed"),
    part(clients.length ? plural(clients.length, "client", "clients") : null),
    part(clients.length ? worth(clients) : null),
  ].filter((x): x is PipelineLinePart => !!x);
  return { summary: line.map((p) => p.words), line, groups, empty: groups.length === 0, pace };
}

/* ------------------------------------------------ the Pipeline's own views: the rail and the address */

/**
 * What the rail picks and the address carries: the whole Pipeline, one group, what waits on the owner (nothing back in
 * a week, lapsed), or one service's deals (`svc:<its name>`).
 */
export type PipelineView = "all" | PipelineGroupKey | "waiting" | "lapsed" | "steps" | `svc:${string}`;

// Built inside a call marked pure, as GROUP_WORDS is: a spread is a side effect to the bundler, and unmarked this
// list, and the groups with it, stayed in the channels, core, db and jobs dists.
const VIEW_KINDS: readonly string[] = /* @__PURE__ */ (() => [
  "all",
  ...PIPELINE_GROUPS,
  "waiting",
  "lapsed",
  "steps",
])();

export function isPipelineView(s: unknown): s is PipelineView {
  return typeof s === "string" && (VIEW_KINDS.includes(s) || (s.startsWith("svc:") && s.slice(4).trim() !== ""));
}

/** The service a view is of; null for any other view. */
function serviceOf(view: PipelineView): string | null {
  return view.startsWith("svc:") ? view.slice(4) : null;
}

/** What waits on the owner, by the workspace's pace: past a week, or past its pace once it has one. */
const waitingLabel = (pace: DealPaceVM | null): string =>
  pace ? PIPELINE_WORDS.rail.waitingPaced(pace.waitDays) : PIPELINE_WORDS.rail.waiting;

/** A view in the owner's words: the rail's own label for it, the phone's button says the same. */
export function pipelineViewLabel(view: PipelineView, pace: DealPaceVM | null): string {
  const svc = serviceOf(view);
  if (svc !== null) return svc;
  if (view === "waiting") return waitingLabel(pace);
  if (view === "lapsed") return PIPELINE_WORDS.rail.lapsed;
  if (view === "steps") return PIPELINE_WORDS.rail.steps;
  if (view === "all") return PIPELINE_WORDS.rail.all;
  return GROUP_WORDS[view as PipelineGroupKey];
}

/** A person's id as the address may carry it: a person's id is a uuid, and nothing with a separator in it is one. */
const PEEK_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The Pipeline's address, as Leads spells its own (contracts leadsRoute): `clients/pipeline`, then the view
 * (`v-proposals`, or a service as `v-s.<its name, encoded>`), then the person open over it (`p-<id>`). The shell reads
 * the hash as it stands, so an encoded name keeps its colons and slashes out of the separators.
 */
export function pipelineRoute(v: { view?: PipelineView | null; peek?: string | null } = {}): string {
  const parts = ["clients/pipeline"];
  const view = v.view && isPipelineView(v.view) ? v.view : "all";
  const svc = serviceOf(view);
  if (svc !== null) parts.push(`v-s.${encodeURIComponent(svc)}`);
  else if (view !== "all") parts.push(`v-${view}`);
  if (v.peek && PEEK_ID.test(v.peek)) parts.push(`p-${v.peek}`);
  return parts.join(":");
}

/** The view and the person an address names; null for an address that is not the Pipeline's. Anything else is left. */
export function parsePipelineRoute(
  route: string | null | undefined,
): { view: PipelineView; peek: string | null } | null {
  const [head, ...segs] = String(route ?? "").split(":");
  if (head !== "clients/pipeline" && head !== "pipeline") return null;
  let view: PipelineView = "all";
  let peek: string | null = null;
  for (const s of segs) {
    if (s.startsWith("v-s.")) {
      let name = "";
      try {
        name = decodeURIComponent(s.slice(4));
      } catch {
        continue;
      }
      if (name.trim()) view = `svc:${name}`;
    } else if (s.startsWith("v-")) {
      const k = s.slice(2);
      if (VIEW_KINDS.includes(k)) view = k as PipelineView;
    } else if (s.startsWith("p-") && PEEK_ID.test(s.slice(2))) peek = s.slice(2);
  }
  return { view, peek };
}

/** One row of the Pipeline's rail: the view it picks, its words, how many, and warn where it counts what waits. */
export interface PipelineRailRow {
  view: PipelineView;
  label: string;
  count: number;
  tone: "warn" | null;
}

export interface PipelineRailSection {
  key: "deals" | "waiting" | "services";
  label: string;
  rows: PipelineRailRow[];
}

/** How many services the rail lists: the busiest, then by name. */
export const PIPELINE_RAIL_SERVICES = 8;

/**
 * The Pipeline's own rail, from the whole Pipeline (`pipelineOf` with no view): All deals and each group, always, so the
 * rail keeps its shape; what waits on the owner, each only when there is some; and each service a deal is for, the
 * busiest first. A consultation has no deal yet, so it counts under its group and All deals, never a service.
 */
export function pipelineRail<T extends PipelineSource>(vm: PipelineVM<T>, nowMs: number): PipelineRailSection[] {
  const count = (key: PipelineGroupKey) => vm.groups.find((g) => g.key === key)?.count ?? 0;
  const deals: PipelineRailRow[] = [
    { view: "all", label: PIPELINE_WORDS.rail.all, count: vm.groups.reduce((n, g) => n + g.count, 0), tone: null },
    ...PIPELINE_GROUPS.map((key) => ({
      view: key as PipelineView,
      label: GROUP_WORDS[key],
      count: count(key),
      tone: null,
    })),
  ];
  const proposals = vm.groups.find((g) => g.key === "proposals")?.rows ?? [];
  const waiting = proposals.filter((r) => waitingOnProposal(r.person, nowMs, vm.pace)).length;
  const lapsed = proposals.filter((r) => !!r.person.deal?.validUntil?.lapsed).length;
  const steps = vm.groups.reduce((n, g) => n + g.rows.filter(stepDue).length, 0);
  const waits: PipelineRailRow[] = [
    { view: "waiting" as PipelineView, label: waitingLabel(vm.pace), count: waiting, tone: "warn" as const },
    { view: "lapsed" as PipelineView, label: PIPELINE_WORDS.rail.lapsed, count: lapsed, tone: "warn" as const },
    // A next step whose day has come (0007, amended), on anyone the Pipeline holds.
    { view: "steps" as PipelineView, label: PIPELINE_WORDS.rail.steps, count: steps, tone: "warn" as const },
  ].filter((r) => r.count > 0);
  const bySvc = new Map<string, number>();
  for (const g of vm.groups) {
    if (g.key === "consultations") continue;
    for (const r of g.rows) if (r.service) bySvc.set(r.service, (bySvc.get(r.service) ?? 0) + 1);
  }
  const services: PipelineRailRow[] = [...bySvc.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, PIPELINE_RAIL_SERVICES)
    .map(([name, n]) => ({ view: `svc:${name}` as PipelineView, label: name, count: n, tone: null }));
  return [
    { key: "deals" as const, label: PIPELINE_WORDS.rail.deals, rows: deals },
    { key: "waiting" as const, label: PIPELINE_WORDS.rail.waitingOnYou, rows: waits },
    { key: "services" as const, label: PIPELINE_WORDS.rail.services, rows: services },
  ].filter((s) => s.rows.length > 0);
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
  id: "heard" | "quote" | "next" | "step";
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
 * already carries, so the peek stands the moment it opens and the deal card fills in as the person lands. `deals`
 * are the person's own once they are read, which say which step a deal card of theirs carries.
 */
export function pipelinePeekOf(
  row: PipelineRowVM,
  group: PipelineGroupKey,
  deals: readonly { id: string; stage: string }[] | null = null,
): PipelinePeekVM {
  const p = row.person;
  const facts: PipelinePeekFact[] = [];
  if (p.lastContact.label) facts.push({ id: "heard", words: p.lastContact.label });
  if (p.quote) facts.push({ id: "quote", words: `“${p.quote}”` });
  if (p.nextVisit) facts.push({ id: "next", words: `Coming up · ${p.nextVisit}` });
  // Their next step, said once. One that names an open deal of theirs is that deal's card's: the peek draws a card
  // for each open deal (dealCardsOf), which says its earliest open step (dealStepOf), and this is theirs. A step
  // about the person, or about a deal that has closed, has no card to say it, so it is said here. Until the person
  // is read, the row's own deal is the one known.
  const n = row.next;
  const known = deals ?? (p.deal ? [p.deal] : []);
  const onCard = !!n?.dealId && known.some((d) => d.id === n.dealId && dealIsOpen(d));
  if (n && !onCard) facts.push({ id: "step", words: `${PIPELINE_WORDS.columns.next} · ${n.words} · ${n.when}` });
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

/* ------------------------------------------------ the row carries the deal: its order, a selection's pass, the peek */

/**
 * How the rows order within each group, by the table's sortable headings: Stage, the Pipeline's own order (reversed,
 * the other way); Value, what each deal comes to over a year; Person, by name. The groups themselves never move.
 */
export const PIPELINE_SORTS = ["stage", "value", "name", "next"] as const;
export type PipelineSort = (typeof PIPELINE_SORTS)[number];

/** A deal's worth over a year, to order by: a month's twelve times, a year's and a one-off's as they are; null for none. */
function yearCents(d: DealVM | null): number | null {
  if (!d || d.amountCents === null || !Number.isFinite(d.amountCents)) return null;
  return d.per === "month" ? d.amountCents * 12 : d.amountCents;
}

/**
 * The same Pipeline with each group's rows in the order the member picked. A tie keeps the Pipeline's own order, and a
 * row with no value goes last whichever way value runs. An order it does not know is the Pipeline's own.
 */
export function pipelineSorted<T extends PipelineSource>(
  vm: PipelineVM<T>,
  by: string | null | undefined,
  dir: "asc" | "desc",
): PipelineVM<T> {
  const sort: PipelineSort = (PIPELINE_SORTS as readonly string[]).includes(by ?? "") ? (by as PipelineSort) : "stage";
  if (sort === "stage" && dir !== "desc") return vm;
  const sign = dir === "desc" ? -1 : 1;
  const groups = vm.groups.map((g) => {
    const ranked = g.rows.map((r, i) => ({ r, i }));
    ranked.sort((a, b) => {
      if (sort === "stage") return sign * (a.i - b.i);
      if (sort === "name") return sign * a.r.name.localeCompare(b.r.name) || a.i - b.i;
      // Next step: by its day, the soonest first; a row with none goes last whichever way it runs.
      if (sort === "next") {
        const x = a.r.next?.day ?? null;
        const y = b.r.next?.day ?? null;
        if (x === y) return a.i - b.i;
        if (x === null) return 1;
        if (y === null) return -1;
        return sign * x.localeCompare(y);
      }
      // What the row shows: a consultation's row shows no value, whatever a deal of theirs that closed came to.
      const x = a.r.value === null ? null : yearCents(a.r.person.deal);
      const y = b.r.value === null ? null : yearCents(b.r.person.deal);
      if (x === y) return a.i - b.i;
      if (x === null) return 1;
      if (y === null) return -1;
      return sign * (x - y);
    });
    return { ...g, rows: ranked.map((x) => x.r) };
  });
  return { ...vm, groups };
}

/** How many a selection's pass records at a press, as People's bar writes fifty (clients-a.jsx PL_BATCH). */
export const PIPELINE_PASS_MAX = 50;

/** A pass asked of a selection: the proposals out in it, why they passed, and those that stay as they are. */
export interface PipelinePassManyVM {
  /** The proposals out this press records, fifty at most. */
  deals: { personId: string; dealId: string }[];
  /** The bar's button, "Mark as passed · 2"; null with no proposal out among them. */
  button: string | null;
  /** The question's own Go, "Mark 2 as passed"; null with no proposal out among them. */
  words: string | null;
  /** Proposals out past the fifty, which stay selected: "12 more stay selected, fifty at a time"; null for none. */
  more: string | null;
  /** "1 is not a proposal out and stays as it is"; null when every one is. */
  rest: string | null;
  /** The reasons a pass is asked, in the deal sheet's own words and order. */
  reasons: { code: DealLostReason; words: string }[];
}

/**
 * Mark as passed for a selection (0008): only a proposal out can pass, so the rest are counted and left as they are,
 * and the one question -- why -- is asked once for all of them. The page records each through the deal door in turn,
 * with the version the person's own read says (a People row does not carry one).
 */
export function pipelinePassMany(rows: readonly PipelineSource[]): PipelinePassManyVM {
  const out = rows
    .filter((r) => r.deal && r.deal.stage === "proposed" && r.deal.id)
    .map((r) => ({ personId: r.id, dealId: r.deal!.id as string }));
  const deals = out.slice(0, PIPELINE_PASS_MAX);
  const later = out.length - deals.length;
  const k = rows.length - out.length;
  return {
    deals,
    button: deals.length ? `${PIPELINE_WORDS.pass.button} · ${deals.length}` : null,
    words: deals.length ? `Mark ${deals.length} as passed` : null,
    more: later ? `${later} more stay selected, fifty at a time` : null,
    rest: k
      ? k === 1
        ? "1 is not a proposal out and stays as it is"
        : `${k} are not proposals out and stay as they are`
      : null,
    reasons: DEAL_LOST_REASONS.map((code) => ({ code, words: DEAL_LOST_REASON_WORDS[code] })),
  };
}

/**
 * What a selection's pass came to, said once: how many were marked; those that had changed since (no longer a
 * proposal out, or moved by someone else), left as they are; and those that could not be recorded at all (offline, a
 * refusal of another kind), which another press may take.
 */
export function pipelinePassDone(
  done: number,
  changed: number,
  failed = 0,
): { words: string; tone: "ok" | "warn" | "danger" } {
  const parts: string[] = [];
  if (done || (!changed && !failed)) parts.push(done === 1 ? "1 marked as passed" : `${done} marked as passed`);
  if (changed)
    parts.push(
      changed === 1 ? "1 had changed, and was left as it is" : `${changed} had changed, and were left as they are`,
    );
  if (failed) parts.push(failed === 1 ? "1 could not be marked" : `${failed} could not be marked`);
  return { words: parts.join(" · "), tone: failed && !done ? "danger" : changed || failed ? "warn" : "ok" };
}

/** One way to reach them in the peek: what it is, the thing itself, and what can be done with it. */
export interface PipelinePeekReachVM {
  id: "phone" | "email" | "replies";
  label: string;
  words: string;
  /** A call's address (tel:), for the number only. */
  call: string | null;
  /** What a copy puts on the clipboard; null where there is nothing to copy. */
  copy: string | null;
}

export interface PipelinePeekDetailVM {
  reach: PipelinePeekReachVM[];
  /** Their deals' moves, newest first, three at most, in the person page's own words: "Proposal out · SEO · $800". */
  history: { id: string; words: string; when: string }[];
}

/**
 * What the peek says once the person is read (0008, "the row carries the deal"): how to reach them -- the number, the
 * address, and what a reply may be now (repliesWords, the person page's own sentence) -- and the last moves of their
 * deals from their timeline. Nothing here is the peek's own: each word is the person page's.
 */
export function pipelinePeekDetail(p: PersonVM): PipelinePeekDetailVM {
  const W = PIPELINE_WORDS.peek.reach;
  const reach: PipelinePeekReachVM[] = [];
  // Not for someone on do-not-contact: the person page's own menu offers neither the call nor the copy (personActs).
  if (p.phone && !(p.consent && p.consent.dnc)) {
    const dial = p.phone.replace(/[^\d+]/g, "");
    reach.push({ id: "phone", label: W.phone, words: p.phone, call: dial ? `tel:${dial}` : null, copy: p.phone });
  }
  if (p.email) reach.push({ id: "email", label: W.email, words: p.email, call: null, copy: p.email });
  const replies = p.hasChat ? repliesWords(p.replyVia, p.replyWindow) : null;
  if (replies) reach.push({ id: "replies", label: W.replies, words: replies, call: null, copy: null });
  const history = p.timeline
    .filter((t) => t.kind === "deal" && !t.ahead)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 3)
    .map((t) => ({ id: t.id, words: t.text, when: t.day }));
  return { reach, history };
}

/** A board column shows this many cards, then says how many more it holds. */
export const PIPELINE_BOARD_CAP = 20;

/** A board column's way to the rest of its cards: "Show 4 more". */
export function pipelineBoardMore(n: number): string {
  return `Show ${n} more`;
}
