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
 *
 * This module builds the Pipeline (pipelineOf) in the shape pipeline-vm.ts declares and in pipeline-words.ts's
 * words. Its views, the rail and the address are pipeline-views.ts's; the peek is pipeline-peek.ts's; the board's
 * moves, the rows' order and a selection's pass are pipeline-board.ts's.
 */
import { clockDate, clockNear, clockNearWhen } from "../../shared/clock";
import { plural } from "../../shared/words";
import { DEAL_CARD_WORDS } from "../sheet/deal-card";
import { amountTotalsWords } from "../deal-amount";
import { wholeDaysSince, type DealVM } from "../deal-vm";
import { heardSinceProposal, proposalsWaiting, waitingOnProposal, type DealPaceVM } from "../deal-waits";
import { consultationsWithoutProposal, consultsHeldWords, dealStageOf } from "../deal-consultations";
import { stepDayOf } from "../../notes/steps";
import { followUpWords } from "../../playbooks/playbooks";
import type {
  PipelineChip,
  PipelineGroupKey,
  PipelineGroupVM,
  PipelineLinePart,
  PipelineNextVM,
  PipelineRowVM,
  PipelineSource,
  PipelineStep,
  PipelineVM,
} from "./pipeline-vm";
import { GROUP_WORDS, PIPELINE_WORDS } from "./pipeline-words";
import { serviceOf, stepDue, type PipelineView } from "./pipeline-views";

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
  if (waitingOnProposal(r, nowMs, pace))
    return r.followUp?.kind === "will"
      ? { words: followUpWords(r.followUp, tz, nowMs), tone: "info" }
      : { words: PIPELINE_WORDS.nothingBack, tone: "warn" };
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
  // Each row in the group its deal stage names (deals.ts dealStageOf), the one rule People's deal lists read too. A
  // consultation ahead is someone with nothing open: something new begins, whatever they passed on or ended before.
  for (const r of rows) {
    if (heldSet.has(r)) continue;
    const stage = dealStageOf(r, nowMs);
    const d = r.deal;
    if (stage === "consultation" && r.consultAhead) ahead.push({ r, c: r.consultAhead });
    else if (!d || !stage || stage === "consultation") continue;
    else if (stage === "proposed") proposals.push({ r, d });
    else if (stage === "won") clients.push({ r, d });
    else closed.push({ r, d });
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
