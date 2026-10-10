/**
 * Campaigns' home: the lifecycle (canvas A, "Lifecycle", approved 2 Oct 2026). The page is five moments around a customer,
 * each covered or not, with every campaign in a ledger under it (lifecycle-ledger.ts); and three tiles: who can hear the
 * workspace, what goes out in the next seven days, and what came back. Every sentence and every number it says is made
 * here, from what the surfaces already carry, so the page composes and never derives (`campaignsHomeOf`).
 *
 * The moments are the journey's (journey/journey.ts journeyOf), in the order the business's customers pass through them:
 * first contact, the day before an appointment, the day after, the proposal follow-up where deals are on (Proposal
 * waiting before Quiet or lapsed), and the win-back (by visits where a calendar is connected, by silence where not: one
 * moment, isWinBack). First contact is the receptionist's, always on; it has no playbook. Each moment is led by its
 * running campaign, says how its campaigns stand, and carries a meter where it holds two or more. What each needs of a
 * person is its message's kind (purposeOfPlaybook): a yes to messages for an appointment or a proposal, a yes to offers
 * for the win-back. An appointment moment without a calendar says it needs one, never a figure it cannot count.
 *
 * A number the surfaces could not count is `null`, never a zero it did not count (the moments' pools say so); a surface
 * not read yet leaves its sections out, and one that failed says so.
 */
import { channelsStandingParts } from "../../broadcasts/channels-standing";
import { offersPausedLine } from "../../broadcasts/email-offers";
import type { ChannelsReady } from "../../broadcasts/reach-for";
import { purposeOfPlaybook } from "../../consent/consent";
import { CONSENT_CHANNELS } from "../../consent/consent-channels";
import { journeyOf, journeyStageOf, type JourneyStage } from "../../journey/journey";
import { emailTemplateRowsOf } from "../../reach-out/reach-out-sheet";
import { CALENDAR_SETTING_ROUTE } from "../../setup/calendar-source";
import { libraryCount } from "../../templates/library-count";
import { channelMarksOf, lifecycleLedger, readyOf, stagePlaybooks, tallyOf } from "./lifecycle-ledger";
import { lifecycleComing, lifecycleReach, lifecycleResults } from "./lifecycle-tiles";
import { LIFECYCLE_WORDS, lifecycleStateOf, tallyWords } from "./lifecycle-words";
import type {
  LifecycleAct,
  LifecycleBar,
  LifecycleBroadcasts,
  LifecycleFailed,
  LifecycleHead,
  LifecycleHome,
  LifecycleInput,
  LifecycleNeeds,
  LifecyclePlaybook,
  LifecyclePlaybooks,
  LifecycleShape,
  LifecycleStage,
} from "./lifecycle-types";
import { isWinBack, triggerOf } from "../playbook-triggers";

/** The moment a new campaign on the win-back starts from: the one the workspace offers, by visits or by silence. */
function winBackMoment(playbooks: LifecyclePlaybooks, fallback: string | null): string | null {
  return playbooks.triggers.find((t) => t.offered && isWinBack(t.id))?.id ?? fallback;
}

/** The moment's pool by the key a stage counts it from: null where the moment was not counted. */
function poolOf(playbooks: LifecyclePlaybooks, key: string) {
  return playbooks.pools[key] ?? null;
}

/**
 * The playbooks as the home reads them: one on an appointment moment where no calendar feeds it runs nothing here
 * (decision 44), and says why, as a follow-up where deals are off does, so its state, its marks and Coming up follow.
 */
function calendarRead(playbooks: LifecyclePlaybooks, shape: LifecycleShape): LifecyclePlaybooks {
  if (shape.calendar === "feed") return playbooks;
  const why = LIFECYCLE_WORDS.needsCalendar[shape.calendar];
  return {
    ...playbooks,
    rows: playbooks.rows.map((p) => (!p.off && triggerOf(p.trigger)?.kind === "visit" ? { ...p, off: why } : p)),
  };
}

/** What a card says of its campaigns: the one's name and clock, or how many stand how; null where none stands on it. */
function stageSummaryOf(own: readonly LifecyclePlaybook[]): string | null {
  if (own.length > 1) return tallyWords(own.length, tallyOf(own));
  const p = own.at(0);
  if (!p) return null;
  const short = lifecycleStateOf(p).short;
  return `${p.name} · ${short.charAt(0).toLowerCase()}${short.slice(1)}`;
}

/** The card's meter: only where a moment holds two or more campaigns. */
function barOf(own: readonly LifecyclePlaybook[]): LifecycleBar | null {
  if (own.length < 2) return null;
  const t = tallyOf(own);
  return { on: t.on, waiting: t.waiting, paused: t.paused, of: own.length };
}

/**
 * Whether the workspace has a line the receptionist can answer on: a WhatsApp number, or any channel that can send now. Where
 * the broadcasts surface is out or failed, or could not say which channels are ready, nothing says there is none, so there is.
 */
function hasLine(broadcasts: LifecycleBroadcasts | null | undefined): boolean {
  const ready = broadcasts?.ready;
  if (!broadcasts || broadcasts.number.present || !ready) return true;
  // The channels by name: the readiness also carries the workspace's pause, which is no channel.
  return CONSENT_CHANNELS.some((c) => ready[c].ready);
}

/** What a stage is drawn from beyond its definition. */
interface StageAt {
  playbooks: LifecyclePlaybooks;
  shape: LifecycleShape;
  line: boolean;
  ready: ChannelsReady | null;
}

/** A stage before its state is said. */
type StageBase = Omit<LifecycleStage, "state" | "stateWords" | "phoneWords" | "tone" | "covered" | "act">;

/** First contact: the receptionist's, always on where there is a line for it to answer on; with none it is off, in words. */
function receptionistStage(base: StageBase, line: boolean): LifecycleStage {
  if (!line)
    return {
      ...base,
      needsWords: LIFECYCLE_WORDS.noLine.needs,
      state: "off",
      stateWords: LIFECYCLE_WORDS.noLine.state,
      phoneWords: "Off",
      tone: "plain",
      covered: false,
      act: null,
    };
  return {
    ...base,
    state: "always",
    stateWords: LIFECYCLE_WORDS.receptionist,
    phoneWords: "Live",
    tone: "ok",
    covered: true,
    act: null,
  };
}

/**
 * An appointment moment without a calendar (decision 44): it cannot be counted here, so no figure and no Turn on; it
 * says it needs a calendar ("…feed" where bookings arrive only by email), and its card opens the campaign made there
 * before, else the calendar's row in Settings. Never covered.
 */
function unmetStage(base: StageBase, shape: LifecycleShape): LifecycleStage {
  const words = LIFECYCLE_WORDS.needsCalendar[shape.calendar === "email" ? "email" : "none"];
  const act: LifecycleAct = base.playbookId
    ? { kind: "open", label: "Open", playbookId: base.playbookId }
    : { kind: "route", label: LIFECYCLE_WORDS.needsCalendar.door, route: CALENDAR_SETTING_ROUTE };
  return {
    ...base,
    people: null,
    channels: [],
    state: "not_here",
    stateWords: words,
    phoneWords: words,
    tone: "plain",
    covered: false,
    act,
  };
}

/** A moment a campaign leads: on with its clock, waiting on the person, paused, or running nothing here, its drawer a press away. */
function playbookStage(base: StageBase, p: LifecyclePlaybook): LifecycleStage {
  const s = lifecycleStateOf(p);
  const state = p.off ? "not_here" : s.paused ? "paused" : "on";
  return {
    ...base,
    state,
    stateWords: s.words,
    phoneWords: s.short,
    tone: s.tone,
    covered: state === "on",
    // On, and a run of it waits for the person: the node is a clock (the pill beside it says "Waiting on you").
    waits: state === "on" && !!p.totals.waiting,
    act: { kind: "open", label: "Open", playbookId: p.id },
  };
}

/** A moment no campaign stands on: off with Turn on where it is offered, else not offered here. */
function emptyStage(base: StageBase, offered: boolean, moment: string): LifecycleStage {
  if (!offered) {
    const words = "Not offered here";
    return {
      ...base,
      state: "not_here",
      stateWords: words,
      phoneWords: words,
      tone: "plain",
      covered: false,
      act: null,
    };
  }
  return {
    ...base,
    state: "off",
    stateWords: "Off",
    phoneWords: "Off",
    tone: "plain",
    covered: false,
    act: { kind: "turn_on", label: "Turn on", moment },
  };
}

/** One stage of the journey, with the campaign that leads it and its count. */
function stageOf(def: JourneyStage, at: StageAt): LifecycleStage {
  const { playbooks } = at;
  const own = def.kind === "moment" ? stagePlaybooks(def, playbooks.rows) : [];
  const p = own.find((x) => x.state === "running") ?? own.at(0) ?? null;
  const moment = def.id === "quiet" ? winBackMoment(playbooks, def.trigger) : def.trigger;
  const poolKey = def.kind === "receptionist" ? def.poolKey : (p?.trigger ?? moment ?? def.poolKey);
  const pool = def.unmet ? null : poolOf(playbooks, poolKey);
  const needs: LifecycleNeeds =
    moment === null
      ? "none"
      : purposeOfPlaybook(triggerOf(moment)?.cls ?? null) === "marketing"
        ? "offers"
        : "messages";
  const base: StageBase = {
    id: def.id,
    caps: def.caps,
    name: p ? p.name : def.name,
    glyph: def.glyph,
    moment,
    playbookId: p ? p.id : null,
    people: pool ? pool.pool : null,
    unit: def.unit,
    needs,
    needsWords: LIFECYCLE_WORDS.needs[needs],
    hint: null,
    waits: false,
    // A campaign's channels; the receptionist's and an empty moment's are none (what Turn on ticks is the composer's to say).
    channels: p ? channelMarksOf(p, playbooks.templates, at.ready) : [],
    summary: stageSummaryOf(own),
    bar: barOf(own),
  };
  if (def.kind === "receptionist") return receptionistStage(base, at.line);
  if (def.unmet) return unmetStage(base, at.shape);
  if (p) return playbookStage(base, p);
  const offered = moment !== null && playbooks.triggers.some((t) => t.id === moment && t.offered);
  return emptyStage(base, offered, moment ?? def.poolKey);
}

/** The one off moment that has people it would reach: its Turn on says how many, in its own words ("Turn on · 3 tomorrow"). */
function withHint(
  stages: readonly LifecycleStage[],
  defs: readonly JourneyStage[],
  playbooks: LifecyclePlaybooks,
): LifecycleStage[] {
  const reachOf = (s: LifecycleStage) => poolOf(playbooks, s.moment ?? "")?.candidates ?? 0;
  const at = stages.findIndex((s) => s.state === "off" && reachOf(s) > 0);
  if (at < 0) return [...stages];
  return stages.map((s, i) => {
    if (i !== at || s.act?.kind !== "turn_on") return s;
    const hint = `Turn on · ${reachOf(s)} ${defs.find((d) => d.id === s.id)?.off?.hint ?? ""}`;
    return { ...s, hint, act: { ...s.act, label: hint } };
  });
}

/** The journey's stages for the workspace's shape (journey.ts journeyOf), each drawn, with their definitions. */
function lifecycleStages(at: StageAt): { defs: JourneyStage[]; stages: LifecycleStage[] } {
  const held = new Set(
    at.playbooks.rows.flatMap((p) => {
      const id = journeyStageOf(p.trigger);
      return id ? [id] : [];
    }),
  );
  const defs = journeyOf({
    calendarOn: at.shape.calendar === "feed",
    dealsOn: at.shape.dealsOn,
    word: at.shape.word,
    held,
  });
  return {
    defs,
    stages: withHint(
      defs.map((d) => stageOf(d, at)),
      defs,
      at.playbooks,
    ),
  };
}

/** The emails reach-outs write, as the Library lists them: none where the chains are unread or could not be read, as that page has it. */
function emailRowsOf(reachOuts: LifecycleInput["reachOuts"]): number {
  return reachOuts ? emailTemplateRowsOf(reachOuts).length : 0;
}

/**
 * The head: the name, the line under it, the channels the workspace stands on, and the page's two acts. The line is facts
 * alone (what the lede explained every visit, the rail now shows): how many moments are covered (the rail's one count),
 * and how many people can hear from you.
 */
function lifecycleHeadOf(input: LifecycleInput, count: { covered: number; of: number }): LifecycleHead {
  const { covered, of } = count;
  const reach = input.broadcasts?.reach ?? null;
  const parts: Array<string | { b: string }> = [];
  if (of > 0) {
    parts.push({ b: `${covered} of ${of}` }, " moments are covered");
    if (reach) parts.push(", and ", { b: `${reach.canHear} of your ${reach.people}` }, " people can hear from you");
    parts.push(".");
  }
  return {
    title: LIFECYCLE_WORDS.title,
    sentence: parts,
    library: { label: LIFECYCLE_WORDS.library, count: libraryCount(input.messages, emailRowsOf(input.reachOuts)) },
    newMessage: LIFECYCLE_WORDS.newMessage,
    // The email channel's own read carries whether its offers are paused: said under the sentence while they are.
    pausedLine: offersPausedLine(input.broadcasts?.ready?.email.offers),
    channels: channelsStandingParts(readyOf(input)),
  };
}

/** What the drawer calls a campaign: its moment's caption where it leads one, else its group's ("Lists & offers"), else a campaign. */
export function lifecycleKicker(home: LifecycleHome, id: string): string {
  const stage = home.rail.stages.find((s) => s.playbookId === id);
  if (stage) return stage.caps;
  const group = home.ledger.groups.find((g) => g.rows.some((r) => r.id === id));
  return group ? group.caps : LIFECYCLE_WORDS.ledger.kicker;
}

/**
 * The reads that failed, each with its sentence: a read that is `null` (the library, the chains, the broadcasts, the report)
 * or counted false (the moments' pools). A surface not read yet is `undefined` and says nothing; it has not failed. The
 * broadcasts read is said in each tile made from it, and its people that could not be counted in the ladder alone.
 */
function failedOf(input: LifecycleInput): LifecycleFailed {
  const F = LIFECYCLE_WORDS.failed;
  const b = input.broadcasts;
  return {
    templates: input.library === null ? F.templates : null,
    counts: input.playbooks && !input.playbooks.countsRead ? F.counts : null,
    chains: input.reachOuts === null ? F.chains : null,
    report: input.report === null ? F.report : null,
    reach: b === null || (b !== undefined && !b.reach) ? F.reach : null,
    coming: b === null ? F.coming : null,
    results: b === null ? F.results : null,
  };
}

/** The whole home: the head, the rail, the ledger under it, the three tiles, and what could not be read. */
export function campaignsHomeOf(input: LifecycleInput): LifecycleHome {
  // A campaign on an appointment moment no calendar feeds runs nothing here, and every part of the page says so.
  const at: LifecycleInput =
    input.playbooks && input.shape ? { ...input, playbooks: calendarRead(input.playbooks, input.shape) } : input;
  const made: { defs: JourneyStage[]; stages: LifecycleStage[] } =
    at.playbooks && at.shape
      ? lifecycleStages({ playbooks: at.playbooks, shape: at.shape, line: hasLine(at.broadcasts), ready: readyOf(at) })
      : { defs: [], stages: [] };
  const { defs, stages } = made;
  // How many moments are covered, of how many: counted once, and every line that says it reads this.
  const count = { covered: stages.filter((s) => s.covered).length, of: stages.length };
  return {
    head: lifecycleHeadOf(at, count),
    rail: {
      title: LIFECYCLE_WORDS.rail,
      ...count,
      coveredWords: count.of > 0 ? `${count.covered} of ${count.of} moments covered` : null,
      phoneWords: count.of > 0 ? `${count.covered} of ${count.of} on` : null,
      stages,
    },
    ledger: lifecycleLedger({ input: at, defs, stages }),
    reach: lifecycleReach(at, stages),
    coming: lifecycleComing(at, stages, defs),
    results: lifecycleResults(at),
    failed: failedOf(at),
  };
}
