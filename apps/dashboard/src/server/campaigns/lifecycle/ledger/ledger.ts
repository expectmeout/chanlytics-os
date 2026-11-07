/** Ledger: ledger. */

import {
  RUN_GOING_STATES,
  HAND_KINDS,
  reachOutRootOf,
  CALENDAR_SETTING_ROUTE,
  clockNear,
  plural,
  workspacePausedOf,
  LIFECYCLE_WORDS,
  lifecycleChainStateOf,
  tallyWords,
  SEQUENCES_ROUTE,
  runRoute,
} from "@chanlytics/contracts";
import type {
  ChannelsReady,
  JourneyStage,
  ReachOutChainDto,
  LifecycleAct,
  LifecycleGroup,
  LifecycleInput,
  LifecycleLedger,
  LifecyclePlaybooks,
  LifecycleLine,
  LifecycleSource,
  LifecycleStage,
  LifecycleTileRead,
} from "@chanlytics/contracts";
import {
  LEADS_ROUTE,
  LEDGER_PERIOD,
  LEDGER_TOOLS_AT,
  NO_NEXT,
  callTextRow,
  chainMarksOf,
  chainResultsOf,
  offFreedTimeRow,
  offOfferRow,
  playbookRow,
  readyOf,
  receptionistRow,
  rowSearchOf,
  sentResultsOfSource,
  stagePlaybooks,
  type RowAt,
} from "./chains";

/**
 * The emails the check holds in a reach-out's going runs, summed, and the newest such run: what the chain's row says when no
 * run waits for approval (the wiring's second audit, W-campaign-run-template-reachout-4). Null where Sent is unread.
 */
function chainHeldOf(
  rootId: string,
  broadcasts: LifecycleInput["broadcasts"],
): { n: number; runId: string | null } | null {
  if (!broadcasts) return null;
  let count = 0;
  let runId: string | null = null;
  for (const r of broadcasts.rows) {
    if (reachOutRootOf(r.audience) !== rootId || !(RUN_GOING_STATES as readonly string[]).includes(r.state)) continue;
    const held = typeof r.held === "number" ? r.held : 0;
    if (held > 0) {
      count += held;
      runId ??= r.id;
    }
  }
  return { n: count, runId };
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
function chainResumeOf(c: Pick<ReachOutChainDto, "name" | "root_id">): LifecycleResume {
  const resume = LIFECYCLE_WORDS.ledger.resume;
  return {
    kind: "resume",
    label: resume.label,
    playbookId: c.root_id,
    ask: { question: resume.question(c.name), detail: resume.chain },
  };
}

function chainRow(
  reachOutChain: ReachOutChainDto,
  at: { input: LifecycleInput; ready: ChannelsReady | null; caps: string },
): LifecycleLine {
  const ledger = LIFECYCLE_WORDS.ledger;
  const paused = reachOutChain.state !== "running";
  // A run waiting is shown whether or not the reach-out is paused, as a campaign's is (lifecycleChainStateOf).
  const waitingRun = reachOutChain.next.waiting_run_id;
  // A going run's held emails, said where no run waits for approval (a waiting run is the thing to answer first).
  const held = waitingRun ? null : chainHeldOf(reachOutChain.root_id, at.input.broadcasts);
  const heldRun = held && held.n > 0 ? held.runId : null;
  const status: LifecycleLine["status"] = waitingRun ? "waiting" : paused ? "paused" : "on";
  const state = lifecycleChainStateOf(reachOutChain);
  const stateWords = state.words;
  const feeds =
    reachOutChain.fed_by === "list"
      ? ledger.ownList
      : `Cold email${reachOutChain.search ? ` to ${reachOutChain.search.name}` : ""}`;
  const hint = `${feeds} · ${chainStepsWords(reachOutChain.steps)}`;
  const resume = chainResumeOf(reachOutChain);
  return {
    id: reachOutChain.root_id,
    kind: "chain",
    name: reachOutChain.name,
    hint,
    status,
    stateWords,
    phoneWords: stateWords,
    tone: state.tone,
    needs: "none",
    needsWords: ledger.chainNeeds,
    channels: chainMarksOf(at.ready, workspacePausedOf(at.input)),
    people: reachOutChain.people
      ? {
          n: reachOutChain.people.waiting + reachOutChain.people.writing,
          unit: ledger.businesses,
          words: ledger.peopleNow(reachOutChain.people),
        }
      : { n: null, unit: ledger.businesses },
    results: chainResultsOf(reachOutChain.root_id, at.input.chains),
    next: waitingRun
      ? { words: LIFECYCLE_WORDS.coming.waiting, atMs: at.input.nowMs }
      : heldRun && held
        ? { words: LIFECYCLE_WORDS.coming.held(held.n), atMs: at.input.nowMs }
        : paused
          ? { words: "Paused", atMs: null }
          : NO_NEXT,
    open: { kind: "open", label: "Open", playbookId: reachOutChain.root_id },
    waiting: null,
    // The run waiting is the thing to answer, so its door comes before Resume (the drawer has Resume either way).
    act: waitingRun
      ? { kind: "route", label: ledger.openRun, route: runRoute(waitingRun) }
      : heldRun
        ? { kind: "route", label: ledger.openRun, route: runRoute(heldRun) }
        : paused
          ? resume
          : null,
    search: rowSearchOf(reachOutChain.name, hint, at.caps),
  };
}

/** A one-off send of the period, or a run of a playbook since deleted: its run's door in Sent. */
function sentOnceRow(lifecycleSource: LifecycleSource, at: { input: LifecycleInput; caps: string }): LifecycleLine {
  const sentOnce = LIFECYCLE_WORDS.ledger.sentOnce;
  const hint = sentOnce.hint(
    lifecycleSource.lastAt ? clockNear(Date.parse(lifecycleSource.lastAt), at.input.tz, at.input.nowMs) : null,
  );
  return {
    id: lifecycleSource.id,
    kind: "sent_once",
    name: lifecycleSource.name,
    hint,
    status: "off",
    stateWords: sentOnce.state,
    phoneWords: sentOnce.state,
    tone: "plain",
    needs: "none",
    needsWords: "",
    channels: [],
    people: { n: null, unit: "" },
    results: sentResultsOfSource(lifecycleSource),
    next: NO_NEXT,
    open: { kind: "route", label: "Open", route: runRoute(lifecycleSource.id) },
    waiting: null,
    act: null,
    search: rowSearchOf(lifecycleSource.name, hint, at.caps),
  };
}

/** A campaign, as every "how many campaigns" counts it: not First contact's own rows, nor the month's offer before it is made. */
export const isLedgerCampaign = (lifecycleLine: LifecycleLine): boolean =>
  lifecycleLine.kind !== "receptionist" &&
  lifecycleLine.kind !== "call_text" &&
  !(lifecycleLine.kind === "offer" && lifecycleLine.status === "off");

/** A group's line under its caption: how its campaigns stand, else what it says of itself. */
function groupMetaOf(rows: readonly LifecycleLine[], otherwise: string): string {
  const campaigns = rows.filter(isLedgerCampaign);
  if (campaigns.length === 0) return otherwise;
  const fields = { on: 0, waiting: 0, paused: 0, off: 0 };
  for (const r of campaigns) {
    if (r.status === "on" || r.status === "always") fields.on += 1;
    else if (r.status === "waiting") fields.waiting += 1;
    else if (r.status === "paused") fields.paused += 1;
    else fields.off += 1;
  }
  return tallyWords(campaigns.length, fields);
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

/**
 * Lists & offers: the month's offer, a freed time (0082), the campaigns on a list, and any other that stands on no moment.
 */
function listsGroup(at: GroupAt, onStage: ReadonlySet<string>): LifecycleGroup {
  const caps = LIFECYCLE_WORDS.ledger.groups.lists;
  const each = { ...at, caps, unit: "people", counted: true };
  const offered = (id: string) => at.playbooks.triggers.some((t) => t.id === id && t.offered);
  const offers = at.playbooks.rows.filter((p) => p.trigger === "everyone_monthly");
  const freedTimes = at.playbooks.rows.filter((p) => p.trigger === "slot_opened");
  const rest = at.playbooks.rows.filter(
    (p) => p.trigger !== "everyone_monthly" && p.trigger !== "slot_opened" && !onStage.has(p.id),
  );
  const rows = [
    ...(offers.length === 0 && offered("everyone_monthly")
      ? [offOfferRow(caps)]
      : offers.map((p) => playbookRow(p, each))),
    ...(freedTimes.length === 0 && offered("slot_opened")
      ? [offFreedTimeRow(caps)]
      : freedTimes.map((p) => playbookRow(p, each))),
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
export function ledgerRowIn(row: Pick<LifecycleLine, "kind" | "status" | "tone">, status: LedgerStatus): boolean {
  if (status === "all") return true;
  if (row.kind === "sent_once" || row.kind === "receptionist" || row.kind === "call_text") return false;
  return status === "needs" ? row.tone === "warn" : row.status === "paused";
}

/** The status tabs' counts: campaigns only. Needs you is the one amber: a run waiting, or an archived list (decision 13). */
function countsOf(rows: readonly LifecycleLine[]): LifecycleLedger["counts"] {
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
  const sentence = { period: LEDGER_PERIOD, results, words: LIFECYCLE_WORDS.ledger };
  if (!input.playbooks || !input.shape)
    return {
      groups: [],
      counts: { all: 0, running: 0, needs: 0, paused: 0 },
      tools: false,
      sentOnce: null,
      ...sentence,
    };
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
        ? {
            n: once.length,
            open: { kind: "route", label: LIFECYCLE_WORDS.ledger.sentOnce.open, route: SEQUENCES_ROUTE },
          }
        : null,
    ...sentence,
  };
}
