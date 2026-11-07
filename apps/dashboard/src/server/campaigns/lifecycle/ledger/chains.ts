/** Ledger: chains. */

import {
  purposeOfPlaybook,
  CONSENT_CHANNELS,
  CAMPAIGNS_RESULTS_PERIOD,
  fixedDaysOf,
  periodWords,
  VERSION_CHANNEL_WORDS,
  bookingTemplate,
  WHATSAPP_VERSION_ALONE,
  campaignChannelsOf,
  playbookChannelsRead,
  type PlaybookMessage,
  PLAYBOOK_DEFAULTS,
  triggerOf,
  triggerWords,
  nextRunLine,
  resumeDetailOf,
  waitingOffer,
  workspacePausedOf,
  LIFECYCLE_WORDS,
  lifecycleStateOf,
  messageRoute,
  MESSAGES_ROUTE,
} from "@chanlytics/contracts";
import type {
  ChannelsReady,
  AppointmentWord,
  JourneyStage,
  ReachOutChainTotalsDto,
  LifecycleAct,
  LifecycleChains,
  LifecycleChannelMark,
  LifecycleInput,
  LifecycleNeeds,
  LifecyclePlaybook,
  LifecyclePlaybooks,
  LifecycleLine,
  LifecycleRowResults,
  LifecycleStage,
  LifecycleTone,
  LifecycleWaiting,
} from "@chanlytics/contracts";

/** Campaigns before the tools: under seven, no tool line, tabs, heads, phone strip or search (decision 15, a judgment). */
export const LEDGER_TOOLS_AT = 7;

/** The period every number of the ledger is over: "Last 30 days". */
// periodWords takes (days, until) since main's #1526; null is a window ending today ("Last 30 days").
export const LEDGER_PERIOD = periodWords(fixedDaysOf(CAMPAIGNS_RESULTS_PERIOD), null).now;

/** Leads: where a reach-out begins, from a search's businesses (cmp/reach-out/door.tsx). */
export const LEADS_ROUTE = "clients/leads";

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
 * The channels a playbook goes by, as marks in the product's order, from the one reading of them (playbooks/channels.ts
 * playbookChannelsRead: what its drawer's Goes by row shows): on, waits, could, off. One that names none goes by
 * WhatsApp alone, as every campaign made before the channels did; one that runs nothing here carries none, as its drawer
 * draws no row. The page claims nothing it does not know: where the readiness could not be read, a channel it ticks is
 * on and the rest off, and where its message could not be read, nothing is said of what one more tick would open.
 */
export function channelMarksOf(
  lifecyclePlaybook: LifecyclePlaybook,
  templates: LifecyclePlaybooks["templates"],
  ready: ChannelsReady | null,
): LifecycleChannelMark[] {
  if (lifecyclePlaybook.off) return [];
  const ticks = campaignChannelsOf(lifecyclePlaybook.channels);
  const message = playbookMessageOf(lifecyclePlaybook, templates);
  const read = ready === null ? null : playbookChannelsRead(lifecyclePlaybook, ticks, message ?? null, ready);
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
export function chainMarksOf(ready: ChannelsReady | null, workspacePaused: boolean): LifecycleChannelMark[] {
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
  state: { sent: number; replied: number } | null | undefined,
): { kind: "sent"; sent: number; replied: number } | "none" {
  return state && state.sent > 0 ? { kind: "sent", sent: state.sent, replied: state.replied } : "none";
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
export const rowSearchOf = (...parts: string[]): string => parts.join(" ").toLowerCase();

/** No next run to say: "—". */
export const NO_NEXT = { words: LIFECYCLE_WORDS.ledger.dash, atMs: null };

/** What a campaign's row is drawn from beyond the campaign: the input, readiness, the word, and its group. */
export interface RowAt {
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
function rowStatusOf(p: LifecyclePlaybook): LifecycleLine["status"] {
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

function rowNextOf(
  p: LifecyclePlaybook,
  status: LifecycleLine["status"],
  input: LifecycleInput,
): LifecycleLine["next"] {
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

/** Resume, asked in place (resumeDetailOf), with what the row's next batch does by its sequence's mode. */
function resumeOf(p: LifecyclePlaybook, input: LifecycleInput): LifecycleAct {
  const resume = LIFECYCLE_WORDS.ledger.resume;
  const detail = resumeDetailOf(p, { tz: input.tz, nowMs: input.nowMs, paused: workspacePausedOf(input) });
  return { kind: "resume", label: resume.label, playbookId: p.id, ask: { question: resume.question(p.name), detail } };
}

/** A campaign on a moment, on a list, or the month's offer. */
export function playbookRow(lifecyclePlaybook: LifecyclePlaybook, at: RowAt): LifecycleLine {
  const lifecycleState = lifecycleStateOf(lifecyclePlaybook);
  const status = rowStatusOf(lifecyclePlaybook);
  const hint = rowHintOf(lifecyclePlaybook, at.word);
  const archived = !!lifecyclePlaybook.listArchived;
  const needs: LifecycleNeeds =
    purposeOfPlaybook(lifecyclePlaybook.policy_class ?? triggerOf(lifecyclePlaybook.trigger)?.cls ?? null) ===
    "marketing"
      ? "offers"
      : "messages";
  return {
    id: lifecyclePlaybook.id,
    kind:
      lifecyclePlaybook.trigger === "saved_list"
        ? "list"
        : lifecyclePlaybook.trigger === "everyone_monthly"
          ? "offer"
          : "playbook",
    name: lifecyclePlaybook.name,
    hint,
    status,
    stateWords: archived ? LIFECYCLE_WORDS.ledger.archived : lifecycleState.words,
    phoneWords: archived ? LIFECYCLE_WORDS.ledger.archived : lifecycleState.short,
    tone: archived ? "warn" : lifecycleState.tone,
    needs,
    needsWords: LIFECYCLE_WORDS.needs[needs],
    channels: channelMarksOf(lifecyclePlaybook, at.playbooks.templates, at.ready),
    people: { n: at.counted && lifecyclePlaybook.named ? lifecyclePlaybook.named.pool : null, unit: at.unit },
    results: sentResultsOf(lifecyclePlaybook.id, at.input.report),
    next: rowNextOf(lifecyclePlaybook, status, at.input),
    open: { kind: "open", label: "Open", playbookId: lifecyclePlaybook.id },
    waiting: status === "waiting" ? rowWaitingOf(lifecyclePlaybook, at) : null,
    // Resume is the campaign's own, so a paused campaign keeps it beside a run that waits (its row draws the run's Approve
    // first); the rail's Resume reads it too.
    act:
      lifecyclePlaybook.state !== "running" && !lifecyclePlaybook.off && !archived
        ? resumeOf(lifecyclePlaybook, at.input)
        : null,
    search: rowSearchOf(lifecyclePlaybook.name, hint, at.caps),
  };
}

/**
 * The receptionist: First contact's own row, never counted. It opens what it is told, Settings › Business (Ruben, 11 Oct
 * 2026: every row opens something; this one was the one that did nothing).
 */
export function receptionistRow(stage: LifecycleStage): LifecycleLine {
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
    open: { kind: "route", label: "Open", route: "admin/receptionist" },
    waiting: null,
    act: null,
    search: rowSearchOf(stage.name, stage.caps),
  };
}

/**
 * The call's text: the message the phone agent texts a caller who asks to book. Never counted. Its door opens that message
 * over the page it is pressed on, its home the Library open on it (`campaigns/messages/<name>`; Ruben, 11 Oct 2026: never a
 * page of its own); where there is none yet, the Library, where one is written.
 */
export function callTextRow(library: LifecycleInput["library"], caps: string): LifecycleLine {
  const callText = LIFECYCLE_WORDS.callText;
  const found = library ? bookingTemplate(library) : null;
  // Unread says nothing here: a library that could not be read is the page's failed read (failedOf), in this row's place.
  const [status, stateWords, tone]: [LifecycleLine["status"], string, LifecycleTone] = !library
    ? ["off", "", "plain"]
    : found
      ? ["always", callText.on, "ok"]
      : ["off", callText.none, "warn"];
  return {
    id: "call_text",
    kind: "call_text",
    name: callText.name,
    hint: callText.words,
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
    open: { kind: "route", label: "Open", route: found ? messageRoute(found.name) : MESSAGES_ROUTE },
    waiting: null,
    act: null,
    search: rowSearchOf(callText.name, callText.words, caps),
  };
}

/** The month's offer where none is made and it is offered: a line that turns it on, not a campaign. */
export function offOfferRow(caps: string): LifecycleLine {
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
 * A freed time where none is made and it is offered (decision 0082: a calendar is connected): a line that turns it on, as
 * the month's offer's does. It reaches a yes to messages: it answers the person's own ask, as the follow-up does.
 */
export function offFreedTimeRow(caps: string): LifecycleLine {
  const { name, hint } = LIFECYCLE_WORDS.freedTime;
  return {
    id: "slot_opened",
    kind: "playbook",
    name,
    hint,
    status: "off",
    stateWords: "Off",
    phoneWords: "Off",
    tone: "plain",
    needs: "messages",
    needsWords: LIFECYCLE_WORDS.needs.messages,
    channels: [],
    people: { n: null, unit: "people" },
    results: "uncounted",
    next: NO_NEXT,
    open: null,
    waiting: null,
    act: { kind: "turn_on", label: LIFECYCLE_WORDS.ledger.turnOn, moment: "slot_opened" },
    search: rowSearchOf(name, hint, caps),
  };
}
