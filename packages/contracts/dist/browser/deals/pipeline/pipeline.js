import { visitStateOf } from "../../calendar/calendar-words.js";
import { clockDate, clockNear, clockNearWhen } from "../../shared/clock.js";
import { plural } from "../../shared/words.js";
import { DEAL_CARD_WORDS } from "../sheet/deal-card.js";
import { amountTotalsWords } from "../deal-amount.js";
import { daysInStageWords, dealIsOpen, wholeDaysSince } from "../deal-vm.js";
import { heardSinceProposal, proposalTone, waitingOnProposal } from "../deal-waits.js";
import { consultationsWithoutProposal, consultsHeldWords, dealStageOf } from "../deal-consultations.js";
import { stepDayOf } from "../../notes/steps.js";
import { followUpWords } from "../../playbooks/playbooks.js";
import { pipelineRowId } from "./pipeline-vm.js";
import { GROUP_WORDS, PIPELINE_WORDS } from "./pipeline-words.js";
import { serviceOf, stepDue } from "./pipeline-views.js";
const upper = (s) => s ? `${s[0].toUpperCase()}${s.slice(1)}` : s;
const daysWords = (days) => days === null ? "" : daysInStageWords(days);
const zoneOf = (r, tz) => r.calendarTz || tz;
const followUpOfRow = (r, d) => d === r.deal || d.id !== null && d.id === r.deal?.id ? r.followUp : null;
function proposalChip(r, d, tz, nowMs, pace) {
  const mine = { deal: d, askedMs: r.askedMs };
  const followUp = followUpOfRow(r, d);
  if (d.validUntil?.lapsed) return { words: d.validUntil.words, tone: "warn" };
  if (waitingOnProposal(mine, nowMs, pace))
    return followUp?.kind === "will" ? { words: followUpWords(followUp, tz, nowMs), tone: "info" } : { words: PIPELINE_WORDS.nothingBack, tone: "warn" };
  if (heardSinceProposal(mine) && r.askedMs !== null)
    return { words: `Heard back ${clockNear(r.askedMs, tz, nowMs)}`, tone: "info" };
  if (d.validUntil) return { words: d.validUntil.words, tone: "plain" };
  if (!d.proposal) return { words: DEAL_CARD_WORDS.noLink, tone: "plain" };
  return null;
}
const clientChip = (d) => d.since ? { words: upper(d.since), tone: "plain" } : null;
function closedChip(d, tz, nowMs) {
  const what = d.reason ? d.reason.words : d.word;
  return { words: d.sinceMs === null ? what : `${what} \xB7 ${clockDate(d.sinceMs, tz, nowMs)}`, tone: "plain" };
}
const step = (key, at, tone = "plain") => ({
  key,
  at,
  tone
});
function dealTrack(r, d, nowMs, pace) {
  if (d.stage !== "proposed" && d.stage !== "won") return [];
  const held = r.consultedMs !== null && Number.isFinite(r.consultedMs) ? [step("consultation", "done")] : [];
  if (d.stage === "won") return [...held, step("proposal", "done"), step("client", "current", "ok")];
  const tone = proposalTone({ deal: d, askedMs: r.askedMs }, nowMs, pace, followUpOfRow(r, d)?.kind === "will");
  return [...held, step("proposal", "current", tone), step("client", "ahead")];
}
function nextOf(p, tz, nowMs) {
  const s = p.nextStep;
  if (!s) return null;
  const day = stepDayOf(s.day.day, tz, nowMs);
  if (!day) return null;
  return { id: s.id, words: s.words, day: day.day, when: day.words, due: day.due, forWho: s.forWho, dealId: s.dealId };
}
function stepOn(x, n) {
  if (!n) return null;
  const ownRow = !!n.dealId && openOf(x.person).some((d) => d.id === n.dealId);
  return (ownRow ? x.deal?.id === n.dealId : x.id === x.person.id) ? n : null;
}
function dealRow(x, chip, nowMs, group, pace) {
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
    track: dealTrack(r, d, nowMs, pace)
  };
}
function heldRow(r, endMs, tz, nowMs) {
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
      words: `${said ? `${said.text} ` : ""}${clockNear(heldMs, zoneOf(r, tz), nowMs)} \xB7 no proposal yet`,
      tone: "warn"
    },
    // Held, and the proposal is the step now: in warn, as the chip says it, since it waits on the owner.
    track: [step("consultation", "done"), step("proposal", "current", "warn"), step("client", "ahead")]
  };
}
function aheadRow(r, c, tz, nowMs) {
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
    track: [step("consultation", "current", "info"), step("proposal", "ahead"), step("client", "ahead")]
  };
}
function inOrder(xs, at, latest = false) {
  return [...xs].sort((a, b) => {
    const x = at(a);
    const y = at(b);
    if (x === y) return a.r.name.localeCompare(b.r.name) || a.r.id.localeCompare(b.r.id);
    if (x === null) return 1;
    if (y === null) return -1;
    return latest ? y - x : x - y;
  });
}
function openOf(r) {
  if (r.openDeals && r.openDeals.length) return r.openDeals;
  return r.deal && dealIsOpen(r.deal) ? [r.deal] : [];
}
export function pipelineWorth(vm) {
  const of = (key) => amountTotalsWords(
    (vm.groups.find((g) => g.key === key)?.rows ?? []).flatMap(
      (r) => r.deal ? [{ amount_cents: r.deal.amountCents, per: r.deal.per, currency: r.deal.currency }] : []
    )
  );
  return { proposals: of("proposals"), clients: of("clients") };
}
function bandsOf(rows, heldSet, nowMs) {
  const out = { ahead: [], proposals: [], clients: [], closed: [] };
  for (const r of rows) {
    const held = heldSet.has(r);
    const stage = held ? "consultation" : dealStageOf(r, nowMs);
    const aheadOf = !held && stage === "consultation" ? r.consultAhead : null;
    if (aheadOf) out.ahead.push({ r, c: aheadOf });
    const consulting = held || !!aheadOf;
    const open = openOf(r);
    const first = open.find((d) => d === r.deal || d.id !== null && d.id === r.deal?.id) ?? open[0] ?? null;
    const ordered = first ? [first, ...open.filter((d) => d !== first)] : [];
    ordered.forEach((d, i) => {
      const id = pipelineRowId(r.id, consulting || i > 0 ? d.id ?? String(i) : null);
      (d.stage === "proposed" ? out.proposals : out.clients).push({ r, d, id });
    });
    if (!open.length && !consulting && r.deal && stage && stage !== "consultation")
      out.closed.push({ r, d: r.deal, id: r.id });
  }
  return out;
}
export function pipelineOf(rows, nowMs, tz, pace, view = "all") {
  const held = consultationsWithoutProposal(rows, nowMs);
  const { ahead, proposals, clients, closed } = bandsOf(rows, new Set(held), nowMs);
  const lapsed = proposals.filter((x) => !!x.d.validUntil?.lapsed);
  const waits = (x) => waitingOnProposal({ deal: x.d, askedMs: x.r.askedMs }, nowMs, pace);
  const waiting = proposals.filter(waits).length;
  const svc = serviceOf(view);
  const shows = (key) => view === "all" || view === "steps" || view === key || svc !== null || (view === "waiting" || view === "lapsed") && key === "proposals";
  const bySvc = (xs) => svc === null ? xs : xs.filter((x) => x.d.service === svc);
  const shownHeld = shows("consultations") && svc === null ? held : [];
  const shownAhead = shows("consultations") && svc === null ? ahead : [];
  const shownProposals = !shows("proposals") ? [] : view === "waiting" ? proposals.filter(waits) : view === "lapsed" ? lapsed : bySvc(proposals);
  const shownClients = shows("clients") ? bySvc(clients) : [];
  const shownClosed = shows("closed") ? bySvc(closed) : [];
  const group = (key, body, meta) => {
    const all = body.map((x) => ({ ...x, next: stepOn(x, nextOf(x.person, tz, nowMs)) }));
    const rs = view === "steps" ? all.filter(stepDue) : all;
    return {
      key,
      label: GROUP_WORDS[key],
      count: rs.length,
      meta: view === "steps" ? null : meta,
      // Folded on the whole Pipeline only: a view someone picked shows what they picked.
      collapsed: key === "closed" && view === "all",
      rows: rs
    };
  };
  const groups = [
    group(
      "consultations",
      [
        ...shownHeld.map((r) => heldRow(r, r.consultedMs, tz, nowMs)),
        ...inOrder(shownAhead, (x) => x.c.startMs).map((x) => aheadRow(x.r, x.c, tz, nowMs))
      ],
      // One sentence, which Today's row re-prints word for word (consultsHeldWords).
      shownHeld.length ? consultsHeldWords(shownHeld.length) : null
    ),
    group(
      "proposals",
      inOrder(shownProposals, (x) => x.d.sinceMs).map(
        (x) => dealRow(x, proposalChip(x.r, x.d, tz, nowMs, pace), nowMs, "proposals", pace)
      ),
      null
    ),
    group(
      "clients",
      inOrder(shownClients, (x) => x.d.sinceMs, true).map((x) => dealRow(x, clientChip(x.d), nowMs, "clients", pace)),
      null
    ),
    group(
      "closed",
      inOrder(shownClosed, (x) => x.d.sinceMs, true).map(
        (x) => dealRow(x, closedChip(x.d, tz, nowMs), nowMs, "closed", pace)
      ),
      null
    )
  ].filter((g) => g.count > 0);
  const part = (words, press = null) => words ? { words, view: press, tone: press ? "warn" : null } : null;
  const line = [
    part(proposals.length ? `${plural(proposals.length, "proposal", "proposals")} out` : null),
    part(waiting ? PIPELINE_WORDS.waitingLine(waiting, pace) : null, "waiting"),
    part(lapsed.length ? `${lapsed.length} lapsed` : null, "lapsed"),
    // Clients are people: a client of two services is one client, whose two deals are both in what they come to.
    part(clients.length ? plural(new Set(clients.map((x) => x.r.id)).size, "client", "clients") : null)
  ].filter((x) => !!x);
  const clientCount = new Set(clients.map((x) => x.r.id)).size;
  const filter = (view2, count, words, tone) => count > 0 ? [{ view: view2, count, words, tone }] : [];
  const filters = [
    ...filter(
      "proposals",
      proposals.length,
      `${proposals.length} ${proposals.length === 1 ? "proposal" : "proposals"} out`,
      "info"
    ),
    ...filter("waiting", waiting, `${waiting} waiting`, "warn"),
    ...filter("lapsed", lapsed.length, `${lapsed.length} lapsed`, "warn"),
    ...filter("clients", clientCount, plural(clientCount, "client", "clients"), "ok")
  ];
  return { summary: line.map((p) => p.words), line, filters, groups, empty: groups.length === 0, pace };
}
