/**
 * The Pipeline (docs/decisions/0008-a-proposal-is-part-of-the-deal.md): People's rows by where their deal stands, and
 * one line over them. A view of People, never a page of its own: it is made of the People surface's rows and reads
 * nothing else, and every workspace has it (0008, amended 18 Oct 2026).
 *
 * Four groups, in this order, and a row in each for every open deal of a person's (0029: a client of one service with
 * a proposal out for another is in both groups, and two proposals out are two rows), else one for where they stand:
 *
 *   Consultations     one held in the last week with no proposal since (consultationsWithoutProposal), the oldest
 *                     first; then one coming up, the soonest first
 *   Proposal out      the one waiting longest first
 *   Clients           the newest first
 *   Passed or ended   the newest first, folded until someone opens it
 *
 * A row says who, the service, the value, how long it has stood where it is ("8 d"), and at most one chip: the one
 * thing to know about it, in warn only where something waits on the owner. The rules are deals.ts's --
 * consultationsWithoutProposal, waitingOnProposal, heardSinceProposal -- and the words are the
 * deal's own wherever it has them (DealVM); nothing is decided twice. Every other word the Pipeline says is here, and
 * a page only composes it. Pure.
 *
 * This module builds the Pipeline (pipelineOf) in the shape pipeline-vm.ts declares and in pipeline-words.ts's
 * words. Its views, the rail and the address are pipeline-views.ts's; the peek is pipeline-peek.ts's; the board's
 * moves, the rows' order and a selection's pass are pipeline-board.ts's.
 */
import { visitStateOf } from "../../calendar/calendar-words";
import { clockDate, clockNear, clockNearWhen } from "../../shared/clock";
import { plural } from "../../shared/words";
import { DEAL_CARD_WORDS } from "../sheet/deal-card";
import { amountTotalsWords } from "../deal-amount";
import { daysInStageWords, dealIsOpen, wholeDaysSince, type DealVM } from "../deal-vm";
import { heardSinceProposal, proposalTone, waitingOnProposal, type DealPaceVM } from "../deal-waits";
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
  PipelineFilter,
} from "./pipeline-vm";
import { pipelineRowId } from "./pipeline-vm";
import { GROUP_WORDS, PIPELINE_WORDS } from "./pipeline-words";
import { serviceOf, stepDue, type PipelineView } from "./pipeline-views";

const upper = (s: string): string => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : s);
/** A time in stage in words, "8 d" or "today", from the one count of whole days (wholeDaysSince); "" without one. */
const daysWords = (days: number | null): string => (days === null ? "" : daysInStageWords(days));
/** A visit is said by the calendar's own clock, as People says it (PersonRowVM.nextVisit). */
const zoneOf = (r: PipelineSource, tz: string): string => r.calendarTz || tz;

/** The follow-up's stand where it is of this row's deal: People's row says it for the deal it shows, so only that deal's row does. */
const followUpOfRow = (r: PipelineSource, d: DealVM): PipelineSource["followUp"] | null =>
  d === r.deal || (d.id !== null && d.id === r.deal?.id) ? r.followUp : null;

/**
 * A proposal out's one chip, the first that holds: past its day, nothing back in a week, heard back since, its day, no
 * link to it. Past its day is first: it is the owner's whatever came back since, and the chip says who a deal waits on
 * as its steps do (deal-waits.ts proposalTone), so a lapsed proposal is never said in the info tone.
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
  // Judged against this row's deal (0029): the person's other proposal has its own row and its own wait.
  const mine = { deal: d, askedMs: r.askedMs };
  const followUp = followUpOfRow(r, d);
  if (d.validUntil?.lapsed) return { words: d.validUntil.words, tone: "warn" };
  if (waitingOnProposal(mine, nowMs, pace))
    return followUp?.kind === "will"
      ? { words: followUpWords(followUp, tz, nowMs), tone: "info" }
      : { words: PIPELINE_WORDS.nothingBack, tone: "warn" };
  if (heardSinceProposal(mine) && r.askedMs !== null)
    return { words: `Heard back ${clockNear(r.askedMs, tz, nowMs)}`, tone: "info" };
  if (d.validUntil) return { words: d.validUntil.words, tone: "plain" };
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
 * stands, in the tone of who it waits on (deal-waits.ts proposalTone, the one rule the deal sheet and the person page's
 * card draw it in too); a client has come through both. A pass or an end has none.
 */
function dealTrack(r: PipelineSource, d: DealVM, nowMs: number, pace: DealPaceVM | null): PipelineStep[] {
  if (d.stage !== "proposed" && d.stage !== "won") return [];
  const held = r.consultedMs !== null && Number.isFinite(r.consultedMs) ? [step("consultation", "done")] : [];
  if (d.stage === "won") return [...held, step("proposal", "done"), step("client", "current", "ok")];
  const tone = proposalTone({ deal: d, askedMs: r.askedMs }, nowMs, pace, followUpOfRow(r, d)?.kind === "will");
  return [...held, step("proposal", "current", tone), step("client", "ahead")];
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

/**
 * A person's next step on one row of theirs (0029: a further open deal is a row of its own): on the row of the deal it
 * names, else on their first row, so it is said, and counted under Steps due, once.
 */
function stepOn<T extends PipelineSource>(x: PipelineRowBody<T>, n: PipelineNextVM | null): PipelineNextVM | null {
  if (!n) return null;
  const ownRow = !!n.dealId && openOf(x.person).some((d) => d.id === n.dealId);
  return (ownRow ? x.deal?.id === n.dealId : x.id === x.person.id) ? n : null;
}

function dealRow<T extends PipelineSource>(
  x: { r: T; d: DealVM; id: string },
  chip: PipelineChip | null,
  nowMs: number,
  group: PipelineGroupKey,
  pace: DealPaceVM | null,
): PipelineRowBody<T> {
  const { r, d, id } = x;
  return {
    id,
    group,
    name: r.name,
    person: r,
    deal: d,
    service: d.service,
    value: d.amount,
    // A proposal's time in stage IS its wait, the number its chip says: the deal's own count, never a second one.
    inStage: daysWords(d.stage === "proposed" ? d.waitingDays : wholeDaysSince(d.sinceMs, nowMs)),
    chip,
    track: dealTrack(r, d, nowMs, pace),
  };
}

/**
 * A consultation that has ended with no proposal since: when, and the step not taken yet. The rule measures from its end
 * (`consultedMs`); the words date it from its start, the day it was, so one that took Monday reads Monday. It is
 * said as the visit is everywhere (calendar-words.ts visitStateOf, D1-consult-held): "Kept" where the owner said they came,
 * "Past" where nobody said, never "Held", which says it took place. A missed one is no consultation to follow (the row's
 * last visit leaves it out).
 */
function heldRow<T extends PipelineSource>(r: T, endMs: number, tz: string, nowMs: number): PipelineRowBody<T> {
  const heldMs = r.lastVisitMs !== null && Number.isFinite(r.lastVisitMs) ? r.lastVisitMs : endMs;
  const said = visitStateOf(r.lastVisitLine?.mark ?? null, endMs, nowMs);
  return {
    id: r.id,
    group: "consultations",
    name: r.name,
    person: r,
    deal: null,
    service: null,
    value: null,
    inStage: daysWords(wholeDaysSince(heldMs, nowMs)),
    chip: {
      words: `${said ? `${said.text} ` : ""}${clockNear(heldMs, zoneOf(r, tz), nowMs)} · no proposal yet`,
      tone: "warn",
    },
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
    deal: null,
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

/** A row's open deals (0029): People's, or the one deal a row from before them shows, while it is open. */
function openOf(r: PipelineSource): DealVM[] {
  if (r.openDeals && r.openDeals.length) return r.openDeals;
  return r.deal && dealIsOpen(r.deal) ? [r.deal] : [];
}

/**
 * What the proposals out and the clients come to, for Ask alone (its Pipeline read and its context): the page says counts
 * only (Ruben, 21 Oct 2026), but what the Pipeline is worth is answered from the one sum, never added up by a model. Each
 * group's deals, a row each (0029), summed by how each recurs (amountTotalsWords); null where none has an amount.
 */
export function pipelineWorth(vm: Pick<PipelineVM, "groups">): { proposals: string | null; clients: string | null } {
  const of = (key: PipelineGroupKey) =>
    amountTotalsWords(
      (vm.groups.find((g) => g.key === key)?.rows ?? []).flatMap((r) =>
        r.deal ? [{ amount_cents: r.deal.amountCents, per: r.deal.per, currency: r.deal.currency }] : [],
      ),
    );
  return { proposals: of("proposals"), clients: of("clients") };
}

/** The rows of the Pipeline's groups but the held consultations, before a view picks among them (bandsOf). */
interface PipelineBands<T> {
  ahead: { r: T; c: { startMs: number; allDay: boolean } }[];
  proposals: { r: T; d: DealVM; id: string }[];
  clients: { r: T; d: DealVM; id: string }[];
  closed: { r: T; d: DealVM; id: string }[];
}

/**
 * Each row in the group its deal stage names (deals.ts dealStageOf), the one rule People's deal lists read too. A
 * consultation ahead is someone with nothing open: something new begins, whatever they passed on or ended before.
 * Every open deal is a row of its own (0029): a client with a proposal out for another service is in both groups, and
 * two proposals out are two rows. A person's first row takes their id, each further one theirs and its deal's.
 */
function bandsOf<T extends PipelineSource>(
  rows: readonly T[],
  heldSet: ReadonlySet<T>,
  nowMs: number,
): PipelineBands<T> {
  const out: PipelineBands<T> = { ahead: [], proposals: [], clients: [], closed: [] };
  for (const r of rows) {
    const held = heldSet.has(r);
    const stage = held ? "consultation" : dealStageOf(r, nowMs);
    const aheadOf = !held && stage === "consultation" ? r.consultAhead : null;
    if (aheadOf) out.ahead.push({ r, c: aheadOf });
    // Someone consulting has no open deal today (dealStageOf names an open one first); were one theirs, its row would
    // still never take the id their consultation's row has.
    const consulting = held || !!aheadOf;
    const open = openOf(r);
    // The row their People row's deal stands for comes first, so it keeps their id; then the rest, newest first.
    const first = open.find((d) => d === r.deal || (d.id !== null && d.id === r.deal?.id)) ?? open[0] ?? null;
    const ordered = first ? [first, ...open.filter((d) => d !== first)] : [];
    ordered.forEach((d, i) => {
      const id = pipelineRowId(r.id, consulting || i > 0 ? (d.id ?? String(i)) : null);
      (d.stage === "proposed" ? out.proposals : out.clients).push({ r, d, id });
    });
    if (!open.length && !consulting && r.deal && stage && stage !== "consultation")
      out.closed.push({ r, d: r.deal, id: r.id });
  }
  return out;
}

/**
 * The Pipeline of these rows: the line over it, its groups and their rows, and whether it is empty. `rows` are People's
 * (PersonRowVM, as the People surface publishes them); `tz` is the workspace's zone; `pace` is its
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
  // them, and Today names the first two of the same list. Nobody in it has an open deal (noProposalSince reads one as a
  // proposal since), so none of theirs is in another group.
  const held = consultationsWithoutProposal(rows, nowMs);
  const { ahead, proposals, clients, closed } = bandsOf(rows, new Set<T>(held), nowMs);
  const lapsed = proposals.filter((x) => !!x.d.validUntil?.lapsed);
  // Each proposal judged against its own deal (0029): a person's two proposals out are two waits.
  const waits = (x: { r: T; d: DealVM }): boolean =>
    waitingOnProposal({ deal: x.d, askedMs: x.r.askedMs }, nowMs, pace);
  const waiting = proposals.filter(waits).length;
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
      ? proposals.filter(waits)
      : view === "lapsed"
        ? lapsed
        : bySvc(proposals);
  const shownClients = shows("clients") ? bySvc(clients) : [];
  const shownClosed = shows("closed") ? bySvc(closed) : [];
  // Each row with its next step, its day said against now; under Steps due, only the rows whose step's day has come,
  // and a group's meta (what its deals come to) is the whole group's, so it is not said of a part of it.
  const group = (key: PipelineGroupKey, body: PipelineRowBody<T>[], meta: string | null): PipelineGroupVM<T> => {
    const all = body.map((x) => ({ ...x, next: stepOn(x, nextOf(x.person, tz, nowMs)) }));
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
        dealRow(x, proposalChip(x.r, x.d, tz, nowMs, pace), nowMs, "proposals", pace),
      ),
      null,
    ),
    group(
      "clients",
      inOrder(shownClients, (x) => x.d.sinceMs, true).map((x) => dealRow(x, clientChip(x.d), nowMs, "clients", pace)),
      null,
    ),
    group(
      "closed",
      inOrder(shownClosed, (x) => x.d.sinceMs, true).map((x) =>
        dealRow(x, closedChip(x.d, tz, nowMs), nowMs, "closed", pace),
      ),
      null,
    ),
  ].filter((g) => g.count > 0);
  // Counts only (Ruben, 21 Oct 2026): what the deals come to is not said on the Pipeline, over the table or in a head.
  const part = (words: string | null, press: PipelineView | null = null): PipelineLinePart | null =>
    words ? { words, view: press, tone: press ? "warn" : null } : null;
  const line = [
    part(proposals.length ? `${plural(proposals.length, "proposal", "proposals")} out` : null),
    part(waiting ? PIPELINE_WORDS.waitingLine(waiting, pace) : null, "waiting"),
    part(lapsed.length ? `${lapsed.length} lapsed` : null, "lapsed"),
    // Clients are people: a client of two services is one client, whose two deals are both in what they come to.
    part(clients.length ? plural(new Set(clients.map((x) => x.r.id)).size, "client", "clients") : null),
  ].filter((x): x is PipelineLinePart => !!x);
  // A phone's filters (Ruben, 10 Oct 2026): the line's counts, each the view it names and its dot's tone.
  const clientCount = new Set(clients.map((x) => x.r.id)).size;
  const filter = (view: PipelineView, count: number, words: string, tone: PipelineFilter["tone"]) =>
    count > 0 ? [{ view, count, words, tone }] : [];
  const filters: PipelineFilter[] = [
    ...filter(
      "proposals",
      proposals.length,
      `${proposals.length} ${proposals.length === 1 ? "proposal" : "proposals"} out`,
      "info",
    ),
    ...filter("waiting", waiting, `${waiting} waiting`, "warn"),
    ...filter("lapsed", lapsed.length, `${lapsed.length} lapsed`, "warn"),
    ...filter("clients", clientCount, plural(clientCount, "client", "clients"), "ok"),
  ];
  return { summary: line.map((p) => p.words), line, filters, groups, empty: groups.length === 0, pace };
}
