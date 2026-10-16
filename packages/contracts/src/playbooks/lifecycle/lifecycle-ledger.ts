/**
 * Campaigns' ledger (spec 2026-10-09 §4.1; canvas A, "Ledger", picked 9 Oct 2026): every campaign of the workspace in
 * one list, grouped by the moment it stands on in the journey's order (journey.ts), then Lists & offers, Reach-outs and,
 * past the threshold, the one-off sends; each row with its last 30 days as the database counts them (campaign_series'
 * `sources`, a chain's own totals), its next run, and the one act its state asks. Pure: one builder per kind of row, the
 * order a sort asks (`ledgerOrder`) and the counts the status tabs say; every word is LIFECYCLE_WORDS.ledger's.
 *
 * A number not counted is "uncounted" ("—"), never a zero; one counted where nothing went is "none" ("Nothing sent").
 * The receptionist and the call's text are First contact's rows of their own kind (the glossary's Campaign) and are
 * never counted. The marks a campaign goes by are read here once, for its row and for its moment's card (lifecycle.ts).
 */
import { RUN_GOING_STATES } from "../../broadcasts/broadcasts";
import type { ChannelsReady } from "../../broadcasts/reach-for";
import { purposeOfPlaybook } from "../../consent/consent";
import { CONSENT_CHANNELS } from "../../consent/consent-channels";
import type { AppointmentWord } from "../../journey/appointment-word";
import type { JourneyStage } from "../../journey/journey";
import type { ReachOutChainDto } from "../../reach-out/reach-out-dtos";
import { HAND_KINDS } from "../../reach-out/reach-out-hand";
import { reachOutRootOf } from "../../reach-out/reach-out-rules";
import type { ReachOutChainTotalsDto } from "../../reports/reach-out-report";
import { CAMPAIGNS_RESULTS_PERIOD, fixedDaysOf } from "../../reports/report-periods";
import { periodWords } from "../../reports/reports";
import { CALENDAR_SETTING_ROUTE } from "../../setup/calendar-source";
import { clockNear } from "../../shared/clock";
import { plural } from "../../shared/words";
import { VERSION_CHANNEL_WORDS } from "../../templates/message-versions";
import { bookingTemplate } from "../../templates/template-order";
import {
  WHATSAPP_VERSION_ALONE,
  campaignChannelsOf,
  playbookChannelsRead,
  type PlaybookMessage,
} from "../playbook-channels";
import { PLAYBOOK_DEFAULTS, triggerOf, triggerWords } from "../playbook-triggers";
import { nextRunLine, resumeDetailOf, waitingOffer, workspacePausedOf } from "./lifecycle-tiles";
import type {
  LifecycleAct,
  LifecycleChains,
  LifecycleChannelMark,
  LifecycleGroup,
  LifecycleHome,
  LifecycleInput,
  LifecycleLedger,
  LifecycleNeeds,
  LifecyclePlaybook,
  LifecyclePlaybooks,
  LifecycleRow,
  LifecycleRowResults,
  LifecycleSource,
  LifecycleStage,
  LifecycleTileRead,
  LifecycleTone,
  LifecycleWaiting,
} from "./lifecycle-types";
import { LIFECYCLE_WORDS, lifecycleChainStateOf, lifecycleStateOf, tallyWords } from "./lifecycle-words";

/** Campaigns before the tools: under seven, no tool line, tabs, heads, phone strip or search (decision 15, a judgment). */
const LEDGER_TOOLS_AT = 7;

/** The orders a desk may sort the rows by: Next (waiting first, then soonest, paused last), Name, People now, Replied. */
export const LEDGER_SORTS = ["next", "name", "people", "replied"] as const;
export type LedgerSort = (typeof LEDGER_SORTS)[number];

/** The period every number of the ledger is over: "Last 30 days". */
// periodWords takes (days, until) since main's #1526; null is a window ending today ("Last 30 days").
const LEDGER_PERIOD = periodWords(fixedDaysOf(CAMPAIGNS_RESULTS_PERIOD), null).now;
/** Sent: where the one-off sends and a run open. */
const SENT_ROUTE = "broadcasts";
/** Leads: where a reach-out begins, from a search's businesses (cmp/reach-out/door.tsx). */
const LEADS_ROUTE = "clients/leads";

/**
 * Whether the workspace can send on each channel, as the home has it: the playbooks surface's own reading, else the
 * broadcasts', else null (the marks then say a ticked channel is on, and the head says nothing of channels).
 */
export function readyOf(input: Pick<LifecycleInput, "playbooks" | "broadcasts">): ChannelsReady | null {
  return input.playbooks?.ready ?? input.broadcasts?.ready ?? null;
}

/**
 * The message a playbook sends, as the surface's templates hold it: by its name and language, whichever version its row
 * names. Undefined where the templates were not read or it is not among them (deleted, hidden): the page then says
 * nothing of what the message holds.
 */
function playbookMessageOf(
  p: LifecyclePlaybook,
  templates: LifecyclePlaybooks["templates"],
): PlaybookMessage | undefined {
  const t = templates?.find((x) => x.name === p.template_name && x.language === p.template_language);
  return t ? { category: t.category ?? null, versions: (t.message ?? WHATSAPP_VERSION_ALONE).versions } : undefined;
}

/**
 * The channels a playbook goes by, as marks in the product's order, from the one reading of them (playbook-channels.ts
 * playbookChannelsRead: what its drawer's Goes by row shows): on, waits, could, off. One that names none goes by
 * WhatsApp alone, as every campaign made before the channels did; one that runs nothing here carries none, as its drawer
 * draws no row. The page claims nothing it does not know: where the readiness could not be read, a channel it ticks is
 * on and the rest off, and where its message could not be read, nothing is said of what one more tick would open.
 */
export function channelMarksOf(
  p: LifecyclePlaybook,
  templates: LifecyclePlaybooks["templates"],
  ready: ChannelsReady | null,
): LifecycleChannelMark[] {
  if (p.off) return [];
  const ticks = campaignChannelsOf(p.channels);
  const message = playbookMessageOf(p, templates);
  const read = ready === null ? null : playbookChannelsRead(p, ticks, message ?? null, ready);
  return CONSENT_CHANNELS.map((c) => {
    const stand = read ? read.stands[c] : ticks.includes(c) ? "on" : "off";
    return { channel: c, word: VERSION_CHANNEL_WORDS[c], state: stand === "could" && !message ? "off" : stand };
  });
}

/**
 * A reach-out's mark: it goes by email alone, which its own sheet judges. On where the workspace can send email, or
 * that was not read; waits where it cannot, or the workspace is paused (`workspacePaused`: either surface's readiness,
 * workspacePausedOf, the one pause every row and Coming up read).
 */
function chainMarksOf(ready: ChannelsReady | null, workspacePaused: boolean): LifecycleChannelMark[] {
  const waits = workspacePaused || (ready !== null && !ready.email.ready);
  return CONSENT_CHANNELS.map((c) => ({
    channel: c,
    word: VERSION_CHANNEL_WORDS[c],
    state: c !== "email" ? "off" : waits ? "waits" : "on",
  }));
}

/** The campaigns that stand on a stage, newest first (the rows come newest first). */
export function stagePlaybooks(def: JourneyStage, rows: readonly LifecyclePlaybook[]): LifecyclePlaybook[] {
  return rows.filter((p) => def.holds.includes(p.trigger));
}

/**
 * How campaigns stand: on, a run waiting on the person (paused or not: lifecycleStateOf says the run first), paused (an
 * archived list's among them), or running nothing here.
 */
export function tallyOf(own: readonly LifecyclePlaybook[]): {
  on: number;
  waiting: number;
  paused: number;
  off: number;
} {
  const t = { on: 0, waiting: 0, paused: 0, off: 0 };
  for (const p of own) {
    if (p.off) t.off += 1;
    else if (p.totals.waiting) t.waiting += 1;
    else if (p.state !== "running") t.paused += 1;
    else t.on += 1;
  }
  return t;
}

/**
 * A source's last 30 days as its row says them: what it sent and how many replied where it sent anything, "none" where
 * it sent nothing (a reply to an older send is no sending in these days). The one rule a row of the ledger and Ask's
 * context of the page (apps/dashboard/src/server/ask/context/pages.ts) both say it by.
 */
export function sentResultsOfSource(
  s: { sent: number; replied: number } | null | undefined,
): { kind: "sent"; sent: number; replied: number } | "none" {
  return s && s.sent > 0 ? { kind: "sent", sent: s.sent, replied: s.replied } : "none";
}

/** A playbook's or a one-off's last 30 days, by its source in campaign_series. */
function sentResultsOf(id: string, report: LifecycleInput["report"]): LifecycleRowResults {
  if (!report) return "uncounted";
  return sentResultsOfSource(report.sources.find((x) => x.id === id));
}

/**
 * The chains' own totals as the ledger reads them (GET reports/reach-outs' `chains`, by root); null where the answer
 * carried none (a server from before them). Campaigns' results surface and Ask's context of the page read them alike.
 * A root whose businesses were not counted (a database before 00404) holds null for them.
 */
export function lifecycleChainsOf(dto: ReachOutChainTotalsDto | null | undefined): LifecycleChains | null {
  if (!dto) return null;
  return {
    complete: dto.complete,
    byRoot: Object.fromEntries(
      Object.entries(dto.by_root).map(([root, c]) => [
        root,
        { written: c.written, businesses: c.businesses ?? null, wroteBack: c.wrote_back },
      ]),
    ),
  };
}

/**
 * A reach-out's last 30 days, by its root: the emails it wrote, the businesses they went to (null where not counted) and
 * how many of them wrote back, where it wrote anything; past the report's twenty, absent is "none" only where every
 * chain was counted. The one rule a reach-out's row of the ledger and Ask's context of the page
 * (apps/dashboard/src/server/ask/context/pages.ts) both say it by.
 */
export function chainResultsOf(rootId: string, chains: LifecycleInput["chains"]): LifecycleRowResults {
  if (!chains) return "uncounted";
  const c = chains.byRoot[rootId];
  if (!c) return chains.complete ? "none" : "uncounted";
  // Read as null where the key is absent, too: an input from before 00404 (an older fixture) has no businesses to say.
  return c.written > 0
    ? { kind: "written", written: c.written, businesses: c.businesses ?? null, wroteBack: c.wroteBack }
    : "none";
}

/** What a search matches: the parts, lower-cased. */
const rowSearchOf = (...parts: string[]): string => parts.join(" ").toLowerCase();

/** No next run to say: "—". */
const NO_NEXT = { words: LIFECYCLE_WORDS.ledger.dash, atMs: null };

/** What a campaign's row is drawn from beyond the campaign: the input, readiness, the word, and its group. */
interface RowAt {
  input: LifecycleInput;
  playbooks: LifecyclePlaybooks;
  ready: ChannelsReady | null;
  word: AppointmentWord;
  /** Its group's caption (a search matches it) and the unit its people are counted in. */
  caps: string;
  unit: string;
  /**
   * Whether its group's moment can be counted here: an appointment moment no calendar feeds cannot (decision 44), and a
   * campaign made there before says no figure, as its moment's card does, never the pool its card was last counted at.
   */
  counted: boolean;
}

/** A row's status, in lifecycleStateOf's order: a run waiting for the owner is shown whether or not the campaign is paused. */
function rowStatusOf(p: LifecyclePlaybook): LifecycleRow["status"] {
  if (p.off) return "not_here";
  if (p.totals.waiting) return "waiting";
  return p.state !== "running" ? "paused" : "on";
}

/**
 * The line under a campaign's name: its list, its cadence, why it runs nothing here, else its moment's hint in the word.
 * A campaign that has ended says so as its state (lifecycleStateOf), so its line says its moment, not its end twice.
 */
function rowHintOf(p: LifecyclePlaybook, word: AppointmentWord): string {
  if (p.trigger === "saved_list") return `On a list · ${p.triggerLabel}`;
  if (p.trigger === "everyone_monthly") return `Every ${p.cadence_days} days, to a yes to offers`;
  if (p.off && !p.ended) return p.off;
  const t = triggerOf(p.trigger);
  return t ? triggerWords(t, word).hint : p.triggerLabel;
}

function rowNextOf(p: LifecyclePlaybook, status: LifecycleRow["status"], input: LifecycleInput): LifecycleRow["next"] {
  if (status === "waiting") return { words: LIFECYCLE_WORDS.coming.waiting, atMs: input.nowMs };
  if (status === "paused") return { words: lifecycleStateOf(p).words, atMs: null };
  if (status !== "on") return NO_NEXT;
  return { words: p.next, atMs: nextRunLine(p, input.nowMs, input.tz).atMs };
}

/** Its run waiting on the person, as its row approves or skips it in place (the verb's own reading, waitingRunOffer). */
function rowWaitingOf(p: LifecyclePlaybook, at: RowAt): LifecycleWaiting | null {
  const id = p.totals.waiting?.id;
  const run = id ? at.input.broadcasts?.rows.find((r) => r.id === id) : undefined;
  if (!run) return null;
  // The pause as Coming up reads it (workspacePausedOf): either surface's readiness, so a row and its line agree.
  const offer = waitingOffer(run, at.input, { paused: workspacePausedOf(at.input), known: true });
  if (offer.kind === "open") return null;
  return { runId: run.id, people: run.recipient_count, refusal: offer.kind === "skip" ? offer.why : null };
}

/** Resume, asked in place (resumeDetailOf), with the class's mode as GET playbooks' `modes` says it. */
function resumeOf(p: LifecyclePlaybook, input: LifecycleInput): LifecycleAct {
  const W = LIFECYCLE_WORDS.ledger.resume;
  const cls = p.policy_class ?? triggerOf(p.trigger)?.cls ?? null;
  const detail = resumeDetailOf(p, {
    tz: input.tz,
    nowMs: input.nowMs,
    paused: workspacePausedOf(input),
    mode: cls === null ? null : input.playbooks?.modes?.[cls],
  });
  return { kind: "resume", label: W.label, playbookId: p.id, ask: { question: W.question(p.name), detail } };
}

/** A campaign on a moment, on a list, or the month's offer. */
function playbookRow(p: LifecyclePlaybook, at: RowAt): LifecycleRow {
  const s = lifecycleStateOf(p);
  const status = rowStatusOf(p);
  const hint = rowHintOf(p, at.word);
  const archived = !!p.listArchived;
  const needs: LifecycleNeeds =
    purposeOfPlaybook(p.policy_class ?? triggerOf(p.trigger)?.cls ?? null) === "marketing" ? "offers" : "messages";
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
    search: rowSearchOf(p.name, hint, at.caps),
  };
}

/**
 * The receptionist: First contact's own row, never counted. It opens what it is told, Settings › Business (Ruben, 11 Oct
 * 2026: every row opens something; this one was the one that did nothing).
 */
function receptionistRow(stage: LifecycleStage): LifecycleRow {
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
    search: rowSearchOf(stage.name, stage.caps),
  };
}

/**
 * The call's text: the message the phone agent texts a caller who asks to book. Never counted. Its door opens that message
 * in a drawer of its own over the home (`campaigns/message:<name>`, Ruben, 11 Oct 2026: a page it went to read as a page);
 * where there is none yet, the Library, where one is written.
 */
function callTextRow(library: LifecycleInput["library"], caps: string): LifecycleRow {
  const W = LIFECYCLE_WORDS.callText;
  const found = library ? bookingTemplate(library) : null;
  // Unread says nothing here: a library that could not be read is the page's failed read (failedOf), in this row's place.
  const [status, stateWords, tone]: [LifecycleRow["status"], string, LifecycleTone] = !library
    ? ["off", "", "plain"]
    : found
      ? ["always", W.on, "ok"]
      : ["off", W.none, "warn"];
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
    search: rowSearchOf(W.name, W.words, caps),
  };
}

/** The month's offer where none is made and it is offered: a line that turns it on, not a campaign. */
function offOfferRow(caps: string): LifecycleRow {
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
    search: rowSearchOf(name, hint, caps),
  };
}

/**
 * The emails the check holds in a reach-out's going runs, summed, and the newest such run: what the chain's row says when no
 * run waits for approval (the wiring's second audit, W-campaign-run-template-reachout-4). Null where Sent is unread.
 */
function chainHeldOf(
  rootId: string,
  broadcasts: LifecycleInput["broadcasts"],
): { n: number; runId: string | null } | null {
  if (!broadcasts) return null;
  let n = 0;
  let runId: string | null = null;
  for (const r of broadcasts.rows) {
    if (reachOutRootOf(r.audience) !== rootId || !(RUN_GOING_STATES as readonly string[]).includes(r.state)) continue;
    const held = typeof r.held === "number" ? r.held : 0;
    if (held > 0) {
      n += held;
      runId ??= r.id;
    }
  }
  return { n, runId };
}

/** A chain's steps in words, as the canvas says them: "3 emails and a call", "2 emails", "2 emails, a call and a note". */
function chainStepsWords(steps: ReachOutChainDto["steps"]): string {
  const emails = steps.filter((s) => !s.hand).length;
  const hands = HAND_KINDS.map((k) => ({ k, n: steps.filter((s) => s.hand?.kind === k).length }));
  const parts = [
    emails ? plural(emails, "email") : null,
    ...hands.map(({ k, n }) => (n === 0 ? null : n === 1 ? `a ${k}` : plural(n, k))),
  ].filter((p): p is string => !!p);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "");
}

/**
 * A reach-out: a chain of cold emails to a search's leads, or to a list its owner adds to (00426). It goes by email; its
 * run is decided on its own page. Its People cell is who is in it now, apart from what came back in 30 days.
 */
/** Resume, as a row and its drawer ask it (decision 7). */
export type LifecycleResume = Extract<LifecycleAct, { kind: "resume" }>;

/**
 * A reach-out's Resume, asked in place: its name, and that its next step goes on its own day. Its row asks it, and so does
 * its drawer (reach-out/row.tsx), where Resume was a single tap with no question (the wiring's second audit, R11 S9-2).
 */
export function chainResumeOf(c: Pick<ReachOutChainDto, "name" | "root_id">): LifecycleResume {
  const W = LIFECYCLE_WORDS.ledger.resume;
  return {
    kind: "resume",
    label: W.label,
    playbookId: c.root_id,
    ask: { question: W.question(c.name), detail: W.chain },
  };
}

/**
 * A campaign's Resume as its row on the home asks it (resumeOf: when it runs next, to about how many, and an `auto` mode
 * in full), for the drawer that opens it, which pressed Resume with no question (the wiring's second audit, R11 S9-2).
 * Null where its row offers no Resume, or the home holds no row of that id.
 */
export function rowResumeOf(home: Pick<LifecycleHome, "ledger">, id: string): LifecycleResume | null {
  const act = home.ledger.groups.flatMap((g) => g.rows).find((r) => r.id === id)?.act;
  return act?.kind === "resume" ? act : null;
}

function chainRow(
  c: ReachOutChainDto,
  at: { input: LifecycleInput; ready: ChannelsReady | null; caps: string },
): LifecycleRow {
  const W = LIFECYCLE_WORDS.ledger;
  const paused = c.state !== "running";
  // A run waiting is shown whether or not the reach-out is paused, as a campaign's is (lifecycleChainStateOf).
  const waitingRun = c.next.waiting_run_id;
  // A going run's held emails, said where no run waits for approval (a waiting run is the thing to answer first).
  const held = waitingRun ? null : chainHeldOf(c.root_id, at.input.broadcasts);
  const heldRun = held && held.n > 0 ? held.runId : null;
  const status: LifecycleRow["status"] = waitingRun ? "waiting" : paused ? "paused" : "on";
  const state = lifecycleChainStateOf(c);
  const stateWords = state.words;
  const feeds = c.fed_by === "list" ? W.ownList : `Cold email${c.search ? ` to ${c.search.name}` : ""}`;
  const hint = `${feeds} · ${chainStepsWords(c.steps)}`;
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
    people: c.people
      ? { n: c.people.waiting + c.people.writing, unit: W.businesses, words: W.peopleNow(c.people) }
      : { n: null, unit: W.businesses },
    results: chainResultsOf(c.root_id, at.input.chains),
    next: waitingRun
      ? { words: LIFECYCLE_WORDS.coming.waiting, atMs: at.input.nowMs }
      : heldRun && held
        ? { words: LIFECYCLE_WORDS.coming.held(held.n), atMs: at.input.nowMs }
        : paused
          ? { words: "Paused", atMs: null }
          : NO_NEXT,
    open: { kind: "open", label: "Open", playbookId: c.root_id },
    waiting: null,
    // The run waiting is the thing to answer, so its door comes before Resume (the drawer has Resume either way).
    act: waitingRun
      ? { kind: "route", label: W.openRun, route: `broadcasts/run:${waitingRun}` }
      : heldRun
        ? { kind: "route", label: W.openRun, route: `broadcasts/run:${heldRun}` }
        : paused
          ? resume
          : null,
    search: rowSearchOf(c.name, hint, at.caps),
  };
}

/** A one-off send of the period, or a run of a playbook since deleted: its run's door in Sent. */
function sentOnceRow(s: LifecycleSource, at: { input: LifecycleInput; caps: string }): LifecycleRow {
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
    search: rowSearchOf(s.name, hint, at.caps),
  };
}

/** A campaign, as every "how many campaigns" counts it: not First contact's own rows, nor the month's offer before it is made. */
export const isLedgerCampaign = (r: LifecycleRow): boolean =>
  r.kind !== "receptionist" && r.kind !== "call_text" && !(r.kind === "offer" && r.status === "off");

/** A group's line under its caption: how its campaigns stand, else what it says of itself. */
function groupMetaOf(rows: readonly LifecycleRow[], otherwise: string): string {
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

/**
 * A moment's add: Turn on (the hinted one where it is the one), the calendar's door where the moment needs one; none on
 * First contact, on a moment that holds its one campaign (the follow-up, 00167), or on one not offered here.
 */
function journeyAddOf(
  def: JourneyStage,
  stage: LifecycleStage,
  held: number,
  playbooks: LifecyclePlaybooks,
): LifecycleAct | null {
  if (def.kind === "receptionist") return null;
  if (def.unmet) return { kind: "route", label: LIFECYCLE_WORDS.needsCalendar.door, route: CALENDAR_SETTING_ROUTE };
  if (def.one && held > 0) return null;
  const moment = stage.moment;
  if (!moment || !playbooks.triggers.some((t) => t.id === moment && t.offered)) return null;
  return {
    kind: "turn_on",
    label: stage.state === "off" && stage.hint ? stage.hint : LIFECYCLE_WORDS.ledger.turnOn,
    moment,
  };
}

/** What every group's rows share. */
type GroupAt = Omit<RowAt, "caps" | "unit" | "counted">;

/** A moment of the journey: its lead first, then the rest as they came; First contact's own rows before its campaigns. */
function journeyGroup(def: JourneyStage, stage: LifecycleStage, at: GroupAt): LifecycleGroup {
  const own = stagePlaybooks(def, at.playbooks.rows);
  const lead = own.find((p) => p.id === stage.playbookId);
  const ordered = lead ? [lead, ...own.filter((p) => p !== lead)] : own;
  const each = { ...at, caps: def.caps, unit: def.unit, counted: !def.unmet };
  const rows = [
    ...(def.kind === "receptionist" ? [receptionistRow(stage), callTextRow(at.input.library, def.caps)] : []),
    ...ordered.map((p) => playbookRow(p, each)),
  ];
  return {
    id: def.id,
    caps: def.caps,
    glyph: def.glyph,
    meta: groupMetaOf(rows, stage.stateWords),
    rows,
    add: journeyAddOf(def, stage, own.length, at.playbooks),
  };
}

/** Lists & offers: the month's offer, the campaigns on a list, and any other that stands on no moment. */
function listsGroup(at: GroupAt, onStage: ReadonlySet<string>): LifecycleGroup {
  const caps = LIFECYCLE_WORDS.ledger.groups.lists;
  const each = { ...at, caps, unit: "people", counted: true };
  const offered = (id: string) => at.playbooks.triggers.some((t) => t.id === id && t.offered);
  const offers = at.playbooks.rows.filter((p) => p.trigger === "everyone_monthly");
  const rest = at.playbooks.rows.filter((p) => p.trigger !== "everyone_monthly" && !onStage.has(p.id));
  const rows = [
    ...(offers.length === 0 && offered("everyone_monthly")
      ? [offOfferRow(caps)]
      : offers.map((p) => playbookRow(p, each))),
    ...rest.map((p) => playbookRow(p, each)),
  ];
  return {
    id: "lists",
    caps,
    glyph: "bolt",
    meta: groupMetaOf(rows, LIFECYCLE_WORDS.ledger.none),
    rows,
    add: offered("saved_list") ? { kind: "turn_on", label: LIFECYCLE_WORDS.ledger.turnOn, moment: "saved_list" } : null,
  };
}

/**
 * Reach-outs: each chain, and the door to Leads, where one begins. Its line says how they stand only once the chains
 * were read: unread or failed (the page's notice says which) it is "—", never "No campaign yet" of chains it could not see.
 */
function reachOutGroup(at: GroupAt): LifecycleGroup {
  const caps = LIFECYCLE_WORDS.ledger.groups.reach_out;
  const chains = at.input.reachOuts;
  const rows = (chains ?? []).map((c) => chainRow(c, { input: at.input, ready: at.ready, caps }));
  return {
    id: "reach_out",
    caps,
    glyph: "send",
    meta: chains ? groupMetaOf(rows, LIFECYCLE_WORDS.ledger.none) : LIFECYCLE_WORDS.ledger.dash,
    rows,
    add: { kind: "route", label: LIFECYCLE_WORDS.ledger.findBusinesses, route: LEADS_ROUTE },
  };
}

/** The period's one-off sends, past the threshold: each opens its run. */
function sentOnceGroup(sources: readonly LifecycleSource[], input: LifecycleInput): LifecycleGroup {
  const caps = LIFECYCLE_WORDS.ledger.groups.sent_once;
  return {
    id: "sent_once",
    caps,
    glyph: "send",
    meta: `${plural(sources.length, "send")} · ${LEDGER_PERIOD.toLowerCase()}`,
    rows: sources.map((s) => sentOnceRow(s, { input, caps })),
    add: null,
  };
}

/** The ledger's status tabs, in the order they stand: All, Needs you (the one amber, decision 13), Paused. */
export const LEDGER_STATUSES = ["all", "needs", "paused"] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

/**
 * Whether a row stands under a status tab: the one predicate the tabs' counts and the page's filter both read. Needs you
 * is what the row's tone asks to be seen for (a run waiting on the owner, a list archived under a running campaign);
 * Paused is paused; a one-off send, the receptionist and the call's text stand under All alone (the counts are
 * campaigns', `countsOf`).
 */
export function ledgerRowIn(row: Pick<LifecycleRow, "kind" | "status" | "tone">, status: LedgerStatus): boolean {
  if (status === "all") return true;
  if (row.kind === "sent_once" || row.kind === "receptionist" || row.kind === "call_text") return false;
  return status === "needs" ? row.tone === "warn" : row.status === "paused";
}

/** The status tabs' counts: campaigns only. Needs you is the one amber: a run waiting, or an archived list (decision 13). */
function countsOf(rows: readonly LifecycleRow[]): LifecycleLedger["counts"] {
  const campaigns = rows.filter(isLedgerCampaign);
  return {
    all: campaigns.length,
    running: campaigns.filter((r) => r.status === "on" || r.status === "waiting").length,
    needs: campaigns.filter((r) => ledgerRowIn(r, "needs")).length,
    paused: campaigns.filter((r) => ledgerRowIn(r, "paused")).length,
  };
}

/** The whole ledger, from the home's input (the playbooks as the home reads them) and the journey's stages, drawn. */
export function lifecycleLedger(at: {
  input: LifecycleInput;
  defs: readonly JourneyStage[];
  stages: readonly LifecycleStage[];
}): LifecycleLedger {
  const { input, defs, stages } = at;
  const results: LifecycleTileRead = input.report === undefined ? "reading" : input.report === null ? "failed" : "read";
  const said = { period: LEDGER_PERIOD, results, words: LIFECYCLE_WORDS.ledger };
  if (!input.playbooks || !input.shape)
    return { groups: [], counts: { all: 0, running: 0, needs: 0, paused: 0 }, tools: false, sentOnce: null, ...said };
  const from: GroupAt = { input, playbooks: input.playbooks, ready: readyOf(input), word: input.shape.word };
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
    sentOnce:
      !tools && once.length > 0
        ? { n: once.length, open: { kind: "route", label: LIFECYCLE_WORDS.ledger.sentOnce.open, route: SENT_ROUTE } }
        : null,
    ...said,
  };
}

/** Where a status sorts under Next: a run waiting first, then what runs, then what does not, paused last. */
const NEXT_RANK: Record<LifecycleRow["status"], number> = {
  waiting: 0,
  on: 1,
  always: 2,
  off: 2,
  not_here: 2,
  paused: 3,
};

/** A row's replies, or a chain's wrote back, to sort by: nothing sent is 0, not counted last. */
function repliedOf(r: LifecycleRow): number {
  if (r.results === "uncounted") return -1;
  if (r.results === "none") return 0;
  return r.results.kind === "sent" ? r.results.replied : r.results.wroteBack;
}

/** How a desk sorts the rows (decision 8): ties by name. */
export function ledgerOrder(by: LedgerSort): (a: LifecycleRow, b: LifecycleRow) => number {
  const byName = (a: LifecycleRow, b: LifecycleRow) => a.name.localeCompare(b.name);
  if (by === "name") return byName;
  if (by === "people") return (a, b) => (b.people.n ?? -1) - (a.people.n ?? -1) || byName(a, b);
  if (by === "replied") return (a, b) => repliedOf(b) - repliedOf(a) || byName(a, b);
  const at = (r: LifecycleRow) => r.next.atMs ?? Number.MAX_SAFE_INTEGER;
  return (a, b) => NEXT_RANK[a.status] - NEXT_RANK[b.status] || at(a) - at(b) || byName(a, b);
}

/**
 * A row's one line on a phone (spec 2026-10-09 §4.4): its moment, its next run and who is at it now ("Appointment
 * tomorrow · tomorrow 10:00 AM · 7 people"), each said where it is known. A run that waits says so on the row's pill, so
 * the line leaves it out; a paused row's end is its Resume, so the line says it rests. A figure not counted is left out,
 * never said as a zero.
 */
/**
 * What a row that is not a campaign does, said first on its phone line: the receptionist answers whoever writes, the
 * call's text is sent when a caller asks for it, the month's offer goes every so often. Null for a campaign, whose line is
 * its next run and its people.
 */
export function ledgerPhoneWhat(r: LifecycleRow): string | null {
  if (r.kind === "receptionist") return r.hint;
  if (r.kind === "call_text") return LIFECYCLE_WORDS.callText.when;
  // The month's offer, not made yet: how often it would go, and to whom ("Every 30 days, to a yes to offers").
  if (r.kind === "offer" && r.status === "off") return r.hint;
  return null;
}

export function ledgerPhoneLine(r: LifecycleRow, caps: string): string {
  const dash = LIFECYCLE_WORDS.ledger.dash;
  const next = r.status === "waiting" || r.next.words === dash ? null : r.next.words;
  return [caps, next, ledgerPeopleWords(r.people)].filter((p): p is string => !!p).join(" · ");
}

/**
 * Who is at a row's moment now, with what they are counted as: "1 person", "7 people", a moment's own unit as it says
 * it ("3 this week"). Said one way on a phone's line and a desk's fold (ledger-row.tsx); null where nobody was counted,
 * never a zero.
 */
export function ledgerPeopleWords(people: LifecycleRow["people"]): string | null {
  if (people.words) return people.words;
  if (people.n === null) return null;
  if (people.unit === "people") return plural(people.n, "person", "people");
  return `${people.n} ${people.unit}`.trim();
}
