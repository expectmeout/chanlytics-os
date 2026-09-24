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
  /** A proposal out that has waited a week with nothing back: the row's In stage already says how long. */
  nothingBack: "Nothing back",
  /** The Pipeline's own rail: its groups, what waits on the owner, and each service. */
  rail: {
    deals: "Deals",
    all: "All deals",
    waitingOnYou: "Waiting on you",
    waiting: "Nothing back in a week",
    lapsed: "Lapsed",
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
function proposalChip(r: PipelineSource, d: DealVM, tz: string, nowMs: number): PipelineChip | null {
  if (waitingOnProposal(r, nowMs)) return { words: PIPELINE_WORDS.nothingBack, tone: "warn" };
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
 * (PersonRowVM, as the People surface publishes them where deals are on); `tz` is the workspace's zone. `view` is the
 * rail's pick: the groups hold only its rows, and the line stays the whole Pipeline's.
 */
export function pipelineOf<T extends PipelineSource>(
  rows: readonly T[],
  nowMs: number,
  tz: string,
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
  ).length;
  // What the view shows: one group, what waits on the owner, or one service's deals. A consultation has no deal yet,
  // so no service; it shows under its own group and under All deals.
  const svc = serviceOf(view);
  const shows = (key: PipelineGroupKey): boolean =>
    view === "all" ||
    view === key ||
    svc !== null ||
    ((view === "waiting" || view === "lapsed") && key === "proposals");
  const bySvc = <X extends { d: DealVM }>(xs: X[]): X[] => (svc === null ? xs : xs.filter((x) => x.d.service === svc));
  const shownHeld = shows("consultations") && svc === null ? held : [];
  const shownAhead = shows("consultations") && svc === null ? ahead : [];
  const shownProposals = !shows("proposals")
    ? []
    : view === "waiting"
      ? proposals.filter((x) => waitingOnProposal(x.r, nowMs))
      : view === "lapsed"
        ? lapsed
        : bySvc(proposals);
  const shownClients = shows("clients") ? bySvc(clients) : [];
  const shownClosed = shows("closed") ? bySvc(closed) : [];
  const group = (key: PipelineGroupKey, rs: PipelineRowVM<T>[], meta: string | null): PipelineGroupVM<T> => ({
    key,
    label: GROUP_WORDS[key],
    count: rs.length,
    meta,
    // Folded on the whole Pipeline only: a view someone picked shows what they picked.
    collapsed: key === "closed" && view === "all",
    rows: rs,
  });
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
        dealRow(x.r, x.d, proposalChip(x.r, x.d, tz, nowMs), nowMs),
      ),
      worth(shownProposals),
    ),
    group(
      "clients",
      inOrder(shownClients, (x) => x.d.sinceMs, true).map((x) => dealRow(x.r, x.d, clientChip(x.d), nowMs)),
      worth(shownClients),
    ),
    group(
      "closed",
      inOrder(shownClosed, (x) => x.d.sinceMs, true).map((x) => dealRow(x.r, x.d, closedChip(x.d, tz, nowMs), nowMs)),
      null,
    ),
  ].filter((g) => g.count > 0);
  const part = (words: string | null, press: PipelineView | null = null): PipelineLinePart | null =>
    words ? { words, view: press, tone: press ? "warn" : null } : null;
  const line = [
    part(proposals.length ? `${plural(proposals.length, "proposal", "proposals")} out` : null),
    part(proposals.length ? worth(proposals) : null),
    part(waiting ? `${waiting} waiting over a week` : null, "waiting"),
    part(lapsed.length ? `${lapsed.length} lapsed` : null, "lapsed"),
    part(clients.length ? plural(clients.length, "client", "clients") : null),
    part(clients.length ? worth(clients) : null),
  ].filter((x): x is PipelineLinePart => !!x);
  return { summary: line.map((p) => p.words), line, groups, empty: groups.length === 0 };
}

/* ------------------------------------------------ the Pipeline's own views: the rail and the address */

/**
 * What the rail picks and the address carries: the whole Pipeline, one group, what waits on the owner (nothing back in
 * a week, lapsed), or one service's deals (`svc:<its name>`).
 */
export type PipelineView = "all" | PipelineGroupKey | "waiting" | "lapsed" | `svc:${string}`;

// Built inside a call marked pure, as GROUP_WORDS is: a spread is a side effect to the bundler, and unmarked this
// list, and the groups with it, stayed in the channels, core, db and jobs dists.
const VIEW_KINDS: readonly string[] = /* @__PURE__ */ (() => ["all", ...PIPELINE_GROUPS, "waiting", "lapsed"])();

export function isPipelineView(s: unknown): s is PipelineView {
  return typeof s === "string" && (VIEW_KINDS.includes(s) || (s.startsWith("svc:") && s.slice(4).trim() !== ""));
}

/** The service a view is of; null for any other view. */
function serviceOf(view: PipelineView): string | null {
  return view.startsWith("svc:") ? view.slice(4) : null;
}

/** A view in the owner's words: the rail's own label for it, the phone's button says the same. */
export function pipelineViewLabel(view: PipelineView): string {
  const svc = serviceOf(view);
  if (svc !== null) return svc;
  if (view === "waiting") return PIPELINE_WORDS.rail.waiting;
  if (view === "lapsed") return PIPELINE_WORDS.rail.lapsed;
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
  const waiting = proposals.filter((r) => waitingOnProposal(r.person, nowMs)).length;
  const lapsed = proposals.filter((r) => !!r.person.deal?.validUntil?.lapsed).length;
  const waits: PipelineRailRow[] = [
    { view: "waiting" as PipelineView, label: PIPELINE_WORDS.rail.waiting, count: waiting, tone: "warn" as const },
    { view: "lapsed" as PipelineView, label: PIPELINE_WORDS.rail.lapsed, count: lapsed, tone: "warn" as const },
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
