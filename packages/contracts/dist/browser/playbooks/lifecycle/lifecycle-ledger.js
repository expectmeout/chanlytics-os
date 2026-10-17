import { RUN_GOING_STATES } from "../../broadcasts/broadcasts.js";
import { purposeOfPlaybook } from "../../consent/consent.js";
import { CONSENT_CHANNELS } from "../../consent/consent-channels.js";
import { HAND_KINDS } from "../../reach-out/reach-out-hand.js";
import { reachOutRootOf } from "../../reach-out/reach-out-rules.js";
import { CAMPAIGNS_RESULTS_PERIOD, fixedDaysOf } from "../../reports/report-periods.js";
import { periodWords } from "../../reports/reports.js";
import { CALENDAR_SETTING_ROUTE } from "../../setup/calendar-source.js";
import { clockNear } from "../../shared/clock.js";
import { plural } from "../../shared/words.js";
import { VERSION_CHANNEL_WORDS } from "../../templates/message-versions.js";
import { bookingTemplate } from "../../templates/template-order.js";
import {
  WHATSAPP_VERSION_ALONE,
  campaignChannelsOf,
  playbookChannelsRead
} from "../playbook-channels.js";
import { PLAYBOOK_DEFAULTS, triggerOf, triggerWords } from "../playbook-triggers.js";
import { nextRunLine, resumeDetailOf, waitingOffer, workspacePausedOf } from "./lifecycle-tiles.js";
import { LIFECYCLE_WORDS, lifecycleChainStateOf, lifecycleStateOf, tallyWords } from "./lifecycle-words.js";
const LEDGER_TOOLS_AT = 7;
const LEDGER_PERIOD = periodWords(fixedDaysOf(CAMPAIGNS_RESULTS_PERIOD), null).now;
const SENT_ROUTE = "broadcasts";
const LEADS_ROUTE = "clients/leads";
export function readyOf(input) {
  return input.playbooks?.ready ?? input.broadcasts?.ready ?? null;
}
function playbookMessageOf(p, templates) {
  const t = templates?.find((x) => x.name === p.template_name && x.language === p.template_language);
  return t ? { category: t.category ?? null, versions: (t.message ?? WHATSAPP_VERSION_ALONE).versions } : void 0;
}
export function channelMarksOf(p, templates, ready) {
  if (p.off) return [];
  const ticks = campaignChannelsOf(p.channels);
  const message = playbookMessageOf(p, templates);
  const read = ready === null ? null : playbookChannelsRead(p, ticks, message ?? null, ready);
  return CONSENT_CHANNELS.map((c) => {
    const stand = read ? read.stands[c] : ticks.includes(c) ? "on" : "off";
    return { channel: c, word: VERSION_CHANNEL_WORDS[c], state: stand === "could" && !message ? "off" : stand };
  });
}
function chainMarksOf(ready, workspacePaused) {
  const waits = workspacePaused || ready !== null && !ready.email.ready;
  return CONSENT_CHANNELS.map((c) => ({
    channel: c,
    word: VERSION_CHANNEL_WORDS[c],
    state: c !== "email" ? "off" : waits ? "waits" : "on"
  }));
}
export function stagePlaybooks(def, rows) {
  return rows.filter((p) => def.holds.includes(p.trigger));
}
export function tallyOf(own) {
  const t = { on: 0, waiting: 0, paused: 0, off: 0 };
  for (const p of own) {
    if (p.off) t.off += 1;
    else if (p.totals.waiting) t.waiting += 1;
    else if (p.state !== "running") t.paused += 1;
    else t.on += 1;
  }
  return t;
}
export function sentResultsOfSource(s) {
  return s && s.sent > 0 ? { kind: "sent", sent: s.sent, replied: s.replied } : "none";
}
function sentResultsOf(id, report) {
  if (!report) return "uncounted";
  return sentResultsOfSource(report.sources.find((x) => x.id === id));
}
export function lifecycleChainsOf(dto) {
  if (!dto) return null;
  return {
    complete: dto.complete,
    byRoot: Object.fromEntries(
      Object.entries(dto.by_root).map(([root, c]) => [
        root,
        { written: c.written, businesses: c.businesses ?? null, wroteBack: c.wrote_back }
      ])
    )
  };
}
export function chainResultsOf(rootId, chains) {
  if (!chains) return "uncounted";
  const c = chains.byRoot[rootId];
  if (!c) return chains.complete ? "none" : "uncounted";
  return c.written > 0 ? { kind: "written", written: c.written, businesses: c.businesses ?? null, wroteBack: c.wroteBack } : "none";
}
const rowSearchOf = (...parts) => parts.join(" ").toLowerCase();
const NO_NEXT = { words: LIFECYCLE_WORDS.ledger.dash, atMs: null };
function rowStatusOf(p) {
  if (p.off) return "not_here";
  if (p.totals.waiting) return "waiting";
  return p.state !== "running" ? "paused" : "on";
}
function rowHintOf(p, word) {
  if (p.trigger === "saved_list") return `On a list \xB7 ${p.triggerLabel}`;
  if (p.trigger === "everyone_monthly") return `Every ${p.cadence_days} days, to a yes to offers`;
  if (p.off && !p.ended) return p.off;
  const t = triggerOf(p.trigger);
  return t ? triggerWords(t, word).hint : p.triggerLabel;
}
function rowNextOf(p, status, input) {
  if (status === "waiting") return { words: LIFECYCLE_WORDS.coming.waiting, atMs: input.nowMs };
  if (status === "paused") return { words: lifecycleStateOf(p).words, atMs: null };
  if (status !== "on") return NO_NEXT;
  return { words: p.next, atMs: nextRunLine(p, input.nowMs, input.tz).atMs };
}
function rowWaitingOf(p, at) {
  const id = p.totals.waiting?.id;
  const run = id ? at.input.broadcasts?.rows.find((r) => r.id === id) : void 0;
  if (!run) return null;
  const offer = waitingOffer(run, at.input, { paused: workspacePausedOf(at.input), known: true });
  if (offer.kind === "open") return null;
  return { runId: run.id, people: run.recipient_count, refusal: offer.kind === "skip" ? offer.why : null };
}
function resumeOf(p, input) {
  const W = LIFECYCLE_WORDS.ledger.resume;
  const cls = p.policy_class ?? triggerOf(p.trigger)?.cls ?? null;
  const detail = resumeDetailOf(p, {
    tz: input.tz,
    nowMs: input.nowMs,
    paused: workspacePausedOf(input),
    mode: cls === null ? null : input.playbooks?.modes?.[cls]
  });
  return { kind: "resume", label: W.label, playbookId: p.id, ask: { question: W.question(p.name), detail } };
}
function playbookRow(p, at) {
  const s = lifecycleStateOf(p);
  const status = rowStatusOf(p);
  const hint = rowHintOf(p, at.word);
  const archived = !!p.listArchived;
  const needs = purposeOfPlaybook(p.policy_class ?? triggerOf(p.trigger)?.cls ?? null) === "marketing" ? "offers" : "messages";
  return {
    id: p.id,
    kind: p.trigger === "saved_list" ? "list" : p.trigger === "everyone_monthly" ? "offer" : "playbook",
    name: p.name,
    hint,
    status,
    stateWords: archived ? LIFECYCLE_WORDS.ledger.archived : s.words,
    phoneWords: archived ? LIFECYCLE_WORDS.ledger.archived : s.short,
    tone: archived ? "warn" : s.tone,
    needs,
    needsWords: LIFECYCLE_WORDS.needs[needs],
    channels: channelMarksOf(p, at.playbooks.templates, at.ready),
    people: { n: at.counted && p.named ? p.named.pool : null, unit: at.unit },
    results: sentResultsOf(p.id, at.input.report),
    next: rowNextOf(p, status, at.input),
    open: { kind: "open", label: "Open", playbookId: p.id },
    waiting: status === "waiting" ? rowWaitingOf(p, at) : null,
    // Resume is the campaign's own, so a paused campaign keeps it beside a run that waits (its row draws the run's Approve
    // first); the rail's Resume reads it too.
    act: p.state !== "running" && !p.off && !archived ? resumeOf(p, at.input) : null,
    search: rowSearchOf(p.name, hint, at.caps)
  };
}
function receptionistRow(stage) {
  return {
    id: "receptionist",
    kind: "receptionist",
    name: stage.name,
    hint: stage.needsWords,
    status: stage.state === "always" ? "always" : "off",
    stateWords: stage.stateWords,
    phoneWords: stage.phoneWords,
    tone: stage.tone,
    needs: "none",
    needsWords: stage.needsWords,
    channels: [],
    people: { n: stage.people, unit: stage.unit },
    results: "uncounted",
    next: NO_NEXT,
    open: { kind: "route", label: "Open", route: "admin/workspace" },
    waiting: null,
    act: null,
    search: rowSearchOf(stage.name, stage.caps)
  };
}
function callTextRow(library, caps) {
  const W = LIFECYCLE_WORDS.callText;
  const found = library ? bookingTemplate(library) : null;
  const [status, stateWords, tone] = !library ? ["off", "", "plain"] : found ? ["always", W.on, "ok"] : ["off", W.none, "warn"];
  return {
    id: "call_text",
    kind: "call_text",
    name: W.name,
    hint: W.words,
    status,
    stateWords,
    phoneWords: stateWords,
    tone,
    needs: "none",
    needsWords: LIFECYCLE_WORDS.needs.none,
    channels: [],
    people: { n: null, unit: "" },
    results: "uncounted",
    next: NO_NEXT,
    open: { kind: "route", label: "Open", route: found ? `campaigns/message:${found.name}` : "messages" },
    waiting: null,
    act: null,
    search: rowSearchOf(W.name, W.words, caps)
  };
}
function offOfferRow(caps) {
  const name = LIFECYCLE_WORDS.monthsOffer.name;
  const hint = `Every ${PLAYBOOK_DEFAULTS.cadenceDays} days, to a yes to offers`;
  return {
    id: "everyone_monthly",
    kind: "offer",
    name,
    hint,
    status: "off",
    stateWords: "Off",
    phoneWords: "Off",
    tone: "plain",
    needs: "offers",
    needsWords: LIFECYCLE_WORDS.needs.offers,
    channels: [],
    people: { n: null, unit: "people" },
    results: "uncounted",
    next: NO_NEXT,
    open: null,
    waiting: null,
    act: { kind: "turn_on", label: LIFECYCLE_WORDS.ledger.turnOn, moment: "everyone_monthly" },
    search: rowSearchOf(name, hint, caps)
  };
}
function chainHeldOf(rootId, broadcasts) {
  if (!broadcasts) return null;
  let n = 0;
  let runId = null;
  for (const r of broadcasts.rows) {
    if (reachOutRootOf(r.audience) !== rootId || !RUN_GOING_STATES.includes(r.state)) continue;
    const held = typeof r.held === "number" ? r.held : 0;
    if (held > 0) {
      n += held;
      runId ??= r.id;
    }
  }
  return { n, runId };
}
function chainStepsWords(steps) {
  const emails = steps.filter((s) => !s.hand).length;
  const hands = HAND_KINDS.map((k) => ({ k, n: steps.filter((s) => s.hand?.kind === k).length }));
  const parts = [
    emails ? plural(emails, "email") : null,
    ...hands.map(({ k, n }) => n === 0 ? null : n === 1 ? `a ${k}` : plural(n, k))
  ].filter((p) => !!p);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "";
}
export function chainResumeOf(c) {
  const W = LIFECYCLE_WORDS.ledger.resume;
  return {
    kind: "resume",
    label: W.label,
    playbookId: c.root_id,
    ask: { question: W.question(c.name), detail: W.chain }
  };
}
function chainRow(c, at) {
  const W = LIFECYCLE_WORDS.ledger;
  const paused = c.state !== "running";
  const waitingRun = c.next.waiting_run_id;
  const held = waitingRun ? null : chainHeldOf(c.root_id, at.input.broadcasts);
  const heldRun = held && held.n > 0 ? held.runId : null;
  const status = waitingRun ? "waiting" : paused ? "paused" : "on";
  const state = lifecycleChainStateOf(c);
  const stateWords = state.words;
  const feeds = c.fed_by === "list" ? W.ownList : `Cold email${c.search ? ` to ${c.search.name}` : ""}`;
  const hint = `${feeds} \xB7 ${chainStepsWords(c.steps)}`;
  const resume = chainResumeOf(c);
  return {
    id: c.root_id,
    kind: "chain",
    name: c.name,
    hint,
    status,
    stateWords,
    phoneWords: stateWords,
    tone: state.tone,
    needs: "none",
    needsWords: W.chainNeeds,
    channels: chainMarksOf(at.ready, workspacePausedOf(at.input)),
    people: c.people ? { n: c.people.waiting + c.people.writing, unit: W.businesses, words: W.peopleNow(c.people) } : { n: null, unit: W.businesses },
    results: chainResultsOf(c.root_id, at.input.chains),
    next: waitingRun ? { words: LIFECYCLE_WORDS.coming.waiting, atMs: at.input.nowMs } : heldRun && held ? { words: LIFECYCLE_WORDS.coming.held(held.n), atMs: at.input.nowMs } : paused ? { words: "Paused", atMs: null } : NO_NEXT,
    open: { kind: "open", label: "Open", playbookId: c.root_id },
    waiting: null,
    // The run waiting is the thing to answer, so its door comes before Resume (the drawer has Resume either way).
    act: waitingRun ? { kind: "route", label: W.openRun, route: `broadcasts/run:${waitingRun}` } : heldRun ? { kind: "route", label: W.openRun, route: `broadcasts/run:${heldRun}` } : paused ? resume : null,
    search: rowSearchOf(c.name, hint, at.caps)
  };
}
function sentOnceRow(s, at) {
  const W = LIFECYCLE_WORDS.ledger.sentOnce;
  const hint = W.hint(s.lastAt ? clockNear(Date.parse(s.lastAt), at.input.tz, at.input.nowMs) : null);
  return {
    id: s.id,
    kind: "sent_once",
    name: s.name,
    hint,
    status: "off",
    stateWords: W.state,
    phoneWords: W.state,
    tone: "plain",
    needs: "none",
    needsWords: "",
    channels: [],
    people: { n: null, unit: "" },
    results: sentResultsOfSource(s),
    next: NO_NEXT,
    open: { kind: "route", label: "Open", route: `${SENT_ROUTE}/run:${s.id}` },
    waiting: null,
    act: null,
    search: rowSearchOf(s.name, hint, at.caps)
  };
}
export const isLedgerCampaign = (r) => r.kind !== "receptionist" && r.kind !== "call_text" && !(r.kind === "offer" && r.status === "off");
function groupMetaOf(rows, otherwise) {
  const campaigns = rows.filter(isLedgerCampaign);
  if (campaigns.length === 0) return otherwise;
  const t = { on: 0, waiting: 0, paused: 0, off: 0 };
  for (const r of campaigns) {
    if (r.status === "on" || r.status === "always") t.on += 1;
    else if (r.status === "waiting") t.waiting += 1;
    else if (r.status === "paused") t.paused += 1;
    else t.off += 1;
  }
  return tallyWords(campaigns.length, t);
}
function journeyAddOf(def, stage, held, playbooks) {
  if (def.kind === "receptionist") return null;
  if (def.unmet) return { kind: "route", label: LIFECYCLE_WORDS.needsCalendar.door, route: CALENDAR_SETTING_ROUTE };
  if (def.one && held > 0) return null;
  const moment = stage.moment;
  if (!moment || !playbooks.triggers.some((t) => t.id === moment && t.offered)) return null;
  return {
    kind: "turn_on",
    label: stage.state === "off" && stage.hint ? stage.hint : LIFECYCLE_WORDS.ledger.turnOn,
    moment
  };
}
function journeyGroup(def, stage, at) {
  const own = stagePlaybooks(def, at.playbooks.rows);
  const lead = own.find((p) => p.id === stage.playbookId);
  const ordered = lead ? [lead, ...own.filter((p) => p !== lead)] : own;
  const each = { ...at, caps: def.caps, unit: def.unit, counted: !def.unmet };
  const rows = [
    ...def.kind === "receptionist" ? [receptionistRow(stage), callTextRow(at.input.library, def.caps)] : [],
    ...ordered.map((p) => playbookRow(p, each))
  ];
  return {
    id: def.id,
    caps: def.caps,
    glyph: def.glyph,
    meta: groupMetaOf(rows, stage.stateWords),
    rows,
    add: journeyAddOf(def, stage, own.length, at.playbooks)
  };
}
function listsGroup(at, onStage) {
  const caps = LIFECYCLE_WORDS.ledger.groups.lists;
  const each = { ...at, caps, unit: "people", counted: true };
  const offered = (id) => at.playbooks.triggers.some((t) => t.id === id && t.offered);
  const offers = at.playbooks.rows.filter((p) => p.trigger === "everyone_monthly");
  const rest = at.playbooks.rows.filter((p) => p.trigger !== "everyone_monthly" && !onStage.has(p.id));
  const rows = [
    ...offers.length === 0 && offered("everyone_monthly") ? [offOfferRow(caps)] : offers.map((p) => playbookRow(p, each)),
    ...rest.map((p) => playbookRow(p, each))
  ];
  return {
    id: "lists",
    caps,
    glyph: "bolt",
    meta: groupMetaOf(rows, LIFECYCLE_WORDS.ledger.none),
    rows,
    add: offered("saved_list") ? { kind: "turn_on", label: LIFECYCLE_WORDS.ledger.turnOn, moment: "saved_list" } : null
  };
}
function reachOutGroup(at) {
  const caps = LIFECYCLE_WORDS.ledger.groups.reach_out;
  const chains = at.input.reachOuts;
  const rows = (chains ?? []).map((c) => chainRow(c, { input: at.input, ready: at.ready, caps }));
  return {
    id: "reach_out",
    caps,
    glyph: "send",
    meta: chains ? groupMetaOf(rows, LIFECYCLE_WORDS.ledger.none) : LIFECYCLE_WORDS.ledger.dash,
    rows,
    add: { kind: "route", label: LIFECYCLE_WORDS.ledger.findBusinesses, route: LEADS_ROUTE }
  };
}
function sentOnceGroup(sources, input) {
  const caps = LIFECYCLE_WORDS.ledger.groups.sent_once;
  return {
    id: "sent_once",
    caps,
    glyph: "send",
    meta: `${plural(sources.length, "send")} \xB7 ${LEDGER_PERIOD.toLowerCase()}`,
    rows: sources.map((s) => sentOnceRow(s, { input, caps })),
    add: null
  };
}
export const LEDGER_STATUSES = ["all", "needs", "paused"];
export function ledgerRowIn(row, status) {
  if (status === "all") return true;
  if (row.kind === "sent_once" || row.kind === "receptionist" || row.kind === "call_text") return false;
  return status === "needs" ? row.tone === "warn" : row.status === "paused";
}
function countsOf(rows) {
  const campaigns = rows.filter(isLedgerCampaign);
  return {
    all: campaigns.length,
    running: campaigns.filter((r) => r.status === "on" || r.status === "waiting").length,
    needs: campaigns.filter((r) => ledgerRowIn(r, "needs")).length,
    paused: campaigns.filter((r) => ledgerRowIn(r, "paused")).length
  };
}
export function lifecycleLedger(at) {
  const { input, defs, stages } = at;
  const results = input.report === void 0 ? "reading" : input.report === null ? "failed" : "read";
  const said = { period: LEDGER_PERIOD, results, words: LIFECYCLE_WORDS.ledger };
  if (!input.playbooks || !input.shape)
    return { groups: [], counts: { all: 0, running: 0, needs: 0, paused: 0 }, tools: false, sentOnce: null, ...said };
  const from = { input, playbooks: input.playbooks, ready: readyOf(input), word: input.shape.word };
  const journey = defs.flatMap((def) => {
    const stage = stages.find((s) => s.id === def.id);
    return stage ? [journeyGroup(def, stage, from)] : [];
  });
  const onStage = new Set(journey.flatMap((g) => g.rows.map((r) => r.id)));
  const groups = [...journey, listsGroup(from, onStage), reachOutGroup(from)];
  const tools = countsOf(groups.flatMap((g) => g.rows)).all >= LEDGER_TOOLS_AT;
  const once = (input.report?.sources ?? []).filter((s) => s.kind === "broadcast");
  const every = tools && once.length > 0 ? [...groups, sentOnceGroup(once, input)] : groups;
  return {
    groups: every,
    counts: countsOf(every.flatMap((g) => g.rows)),
    tools,
    sentOnce: !tools && once.length > 0 ? { n: once.length, open: { kind: "route", label: LIFECYCLE_WORDS.ledger.sentOnce.open, route: SENT_ROUTE } } : null,
    ...said
  };
}
