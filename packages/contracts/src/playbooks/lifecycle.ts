/**
 * Campaigns' home: the lifecycle (canvas A, "Lifecycle", approved 2 Oct 2026). The page is five moments around a customer,
 * each covered or not, with the campaigns that are not one of them under it; and three tiles: who can hear the workspace,
 * what goes out in the next seven days, and what came back. Every sentence and every number it says is made here, from what
 * the surfaces already carry, so the page composes and never derives (`campaignsHomeOf`).
 *
 * The moments are the playbooks' own (playbook-triggers.ts): a visit reminder, the check after a visit, the win-back (by
 * visits where a calendar is connected, by silence where not: one moment, isWinBack), and the proposal follow-up where
 * deals are on. First contact is the receptionist's, always on; it has no playbook. What each needs of a person is its
 * message's kind (purposeOfPlaybook): a yes to messages for a visit or a proposal, a yes to offers for the win-back.
 *
 * A number the surfaces could not count is `null`, never a zero it did not count (the moments' pools say so); a surface
 * not read yet leaves its sections out, and one that failed says so.
 */
import { channelsStandingParts } from "../broadcasts/channels-standing";
import { offersPausedLine } from "../broadcasts/email-offers";
import type { ChannelsReady } from "../broadcasts/reach-for";
import { purposeOfPlaybook } from "../consent/consent";
import { CONSENT_CHANNELS } from "../consent/consent-channels";
import { emailTemplateRowsOf } from "../reach-out/reach-out-sheet";
import { libraryCount } from "../templates/library-count";
import { VERSION_CHANNEL_WORDS } from "../templates/message-versions";
import { bookingTemplate } from "../templates/template-order";
import { plural } from "../shared/words";
import { lifecycleComing, lifecycleReach, lifecycleResults } from "./lifecycle-tiles";
import { LIFECYCLE_WORDS, lifecycleStateOf } from "./lifecycle-words";
import type {
  LifecycleAct,
  LifecycleBroadcasts,
  LifecycleChannelMark,
  LifecycleFailed,
  LifecycleGlyph,
  LifecycleHead,
  LifecycleHome,
  LifecycleInput,
  LifecycleNeeds,
  LifecyclePlaybook,
  LifecyclePlaybooks,
  LifecycleStage,
  LifecycleStrip,
  LifecycleTone,
} from "./lifecycle-types";
import {
  WHATSAPP_VERSION_ALONE,
  campaignChannelsOf,
  playbookChannelsRead,
  type PlaybookMessage,
} from "./playbook-channels";
import { isWinBack, triggerOf } from "./playbook-triggers";

/**
 * Whether the workspace can send on each channel, as the home has it: the playbooks surface's own reading, else the
 * broadcasts', else null (the marks then say a ticked channel is on, and the head says nothing of channels).
 */
function readyOf(input: Pick<LifecycleInput, "playbooks" | "broadcasts">): ChannelsReady | null {
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
function channelMarksOf(
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
 * that was not read; waits where it cannot, or the workspace is paused.
 */
function chainMarksOf(ready: ChannelsReady | null): LifecycleChannelMark[] {
  const waits = ready !== null && (!ready.email.ready || ready.paused === true);
  return CONSENT_CHANNELS.map((c) => ({
    channel: c,
    word: VERSION_CHANNEL_WORDS[c],
    state: c !== "email" ? "off" : waits ? "waits" : "on",
  }));
}

/** What a stage says of its people and what turning it on says it reaches ("3 tomorrow"). */
const STAGES = [
  { id: "first_contact", caps: "First contact", name: "Your receptionist", glyph: "chat", unit: "this week", hint: "" },
  { id: "visit", caps: "Visit tomorrow", name: "Visit reminder", glyph: "bell", unit: "people", hint: "tomorrow" },
  { id: "after", caps: "After a visit", name: "How did it go", glyph: "check", unit: "yesterday", hint: "yesterday" },
  { id: "quiet", caps: "Quiet or lapsed", name: "Win-back", glyph: "refresh", unit: "people", hint: "quiet" },
  { id: "proposal", caps: "Proposal out", name: "Proposal follow-up", glyph: "deal", unit: "waiting", hint: "waiting" },
] as const satisfies ReadonlyArray<{
  id: LifecycleStage["id"];
  caps: string;
  name: string;
  glyph: LifecycleGlyph;
  unit: string;
  hint: string;
}>;

/** The playbook trigger each stage is, where it has one; the win-back's is whichever of its two the workspace can read. */
const STAGE_TRIGGER: Record<LifecycleStage["id"], string | null> = {
  first_contact: null,
  visit: "visit_tomorrow",
  after: "visited",
  quiet: "quiet_30",
  proposal: "proposal_waiting",
};

/** The pool a stage's people are counted from, where it is not the moment's own trigger: first contact is "new this week". */
const FIRST_CONTACT_POOL = "new_week";

/** The one playbook on a stage: a running one first, else the newest (the rows come newest first). */
function playbookOf(id: LifecycleStage["id"], rows: readonly LifecyclePlaybook[]): LifecyclePlaybook | null {
  const trigger = STAGE_TRIGGER[id];
  if (trigger === null) return null;
  const own = rows.filter((p) => (id === "quiet" ? isWinBack(p.trigger) : p.trigger === trigger));
  return own.find((p) => p.state === "running") ?? own[0] ?? null;
}

/** The moment a new playbook on the win-back starts from: the one the workspace offers, by visits or by silence. */
function winBackMoment(playbooks: LifecyclePlaybooks): string {
  return playbooks.triggers.find((t) => t.offered && isWinBack(t.id))?.id ?? "quiet_30";
}

/** The moment's pool by the key a stage counts it from: null where the moment was not counted. */
function poolOf(playbooks: LifecyclePlaybooks, key: string) {
  return playbooks.pools[key] ?? null;
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

/** One stage, with its playbook and its count. */
function stageOf(
  def: (typeof STAGES)[number],
  playbooks: LifecyclePlaybooks,
  line: boolean,
  ready: ChannelsReady | null,
): LifecycleStage | null {
  const trigger = def.id === "quiet" ? winBackMoment(playbooks) : STAGE_TRIGGER[def.id];
  const p = playbookOf(def.id, playbooks.rows);
  const offered = trigger === null || playbooks.triggers.some((t) => t.id === trigger && t.offered) || !!p;
  // A proposal's follow-up runs only where deals are on: no trigger offered and no playbook made, and the stage is not drawn.
  if (def.id === "proposal" && !p && !playbooks.triggers.some((t) => t.id === trigger)) return null;
  const poolKey = def.id === "first_contact" ? FIRST_CONTACT_POOL : (p?.trigger ?? trigger ?? "");
  const pool = poolOf(playbooks, poolKey);
  const needs: LifecycleNeeds =
    trigger === null
      ? "none"
      : purposeOfPlaybook(triggerOf(trigger)?.cls ?? null) === "marketing"
        ? "offers"
        : "messages";
  const base = {
    id: def.id,
    caps: def.caps,
    name: p ? p.name : def.name,
    glyph: def.glyph,
    moment: trigger,
    playbookId: p ? p.id : null,
    people: pool ? pool.pool : null,
    unit: def.unit,
    needs,
    needsWords: LIFECYCLE_WORDS.needs[needs],
    hint: null,
    waits: false,
    // A playbook's channels; the receptionist's and an off moment's are none (what Turn on ticks is the composer's to say).
    channels: p ? channelMarksOf(p, playbooks.templates, ready) : [],
  };
  // First contact is the receptionist's, always on where there is a line for it to answer on; with none it is off, in words.
  if (trigger === null && !line) {
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
  }
  if (trigger === null) {
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
  if (p) {
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
      act: p.off ? null : { kind: "open", label: "Open", playbookId: p.id },
    };
  }
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
    act: { kind: "turn_on", label: "Turn on", moment: trigger },
  };
}

/** The one off moment that has people it would reach: its Turn on says how many ("Turn on · 3 tomorrow"). */
function withHint(stages: readonly LifecycleStage[], playbooks: LifecyclePlaybooks): LifecycleStage[] {
  const at = stages.findIndex((s) => {
    const reach = poolOf(playbooks, s.moment ?? "")?.candidates ?? 0;
    return s.state === "off" && reach > 0;
  });
  if (at < 0) return [...stages];
  return stages.map((s, i) => {
    if (i !== at || s.act?.kind !== "turn_on") return s;
    const n = poolOf(playbooks, s.moment ?? "")?.candidates ?? 0;
    const unit = STAGES.find((d) => d.id === s.id)?.hint ?? "";
    const hint = `Turn on · ${n} ${unit}`;
    return { ...s, hint, act: { ...s.act, label: hint } };
  });
}

/** The five moments (four where deals are off), in order. */
function lifecycleStages(playbooks: LifecyclePlaybooks, line: boolean, ready: ChannelsReady | null): LifecycleStage[] {
  const made = STAGES.map((d) => stageOf(d, playbooks, line, ready)).filter((s): s is LifecycleStage => s !== null);
  return withHint(made, playbooks);
}

/** A running playbook's strip: its state, the channels it goes by (`channels`, its marks), and the act that fits it. */
function stripOfPlaybook(
  p: LifecyclePlaybook,
  kind: LifecycleStrip["kind"],
  glyph: LifecycleGlyph,
  words: string,
  channels: LifecycleChannelMark[],
) {
  const s = lifecycleStateOf(p);
  const open: LifecycleAct = { kind: "open", label: "Open", playbookId: p.id };
  const resume: LifecycleAct = { kind: "resume", label: "Resume", playbookId: p.id };
  return {
    id: p.id,
    kind,
    glyph,
    name: p.name,
    words,
    stateWords: p.listArchived ? "Its list is archived" : s.words,
    tone: p.listArchived ? "warn" : s.tone,
    open,
    act: s.paused && !p.listArchived ? resume : open,
    channels,
  } satisfies LifecycleStrip;
}

/** The call's text: the message the phone agent texts a caller who asks to book, and whether the workspace has one. */
function callTextStrip(library: LifecycleInput["library"]): LifecycleStrip {
  const W = LIFECYCLE_WORDS.callText;
  const open: LifecycleAct = { kind: "route", label: "Open", route: "messages" };
  const found = library ? bookingTemplate(library) : null;
  // Unread says nothing here: a library that could not be read is the page's failed read (failedOf), in this line's place.
  const [stateWords, tone]: [string, LifecycleTone] = !library
    ? ["", "plain"]
    : found
      ? [W.on, "ok"]
      : [W.none, "warn"];
  return {
    id: "call_text",
    kind: "call_text",
    glyph: "phone",
    name: W.name,
    words: W.words,
    stateWords,
    tone,
    open,
    act: open,
    channels: [],
  };
}

/** The month's offer: its playbook where one was made, else a line that offers to turn it on. */
function monthsOfferStrip(playbooks: LifecyclePlaybooks, ready: ChannelsReady | null): LifecycleStrip | null {
  const p = playbooks.rows.find((r) => r.trigger === "everyone_monthly");
  if (p) {
    const marks = channelMarksOf(p, playbooks.templates, ready);
    return stripOfPlaybook(p, "moment", "gift", `Every ${p.cadence_days} days, to a yes to offers`, marks);
  }
  if (!playbooks.triggers.some((t) => t.id === "everyone_monthly" && t.offered)) return null;
  const name = LIFECYCLE_WORDS.monthsOffer.name;
  const turnOn: LifecycleAct = { kind: "turn_on", label: "Turn on", moment: "everyone_monthly" };
  return {
    id: "everyone_monthly",
    kind: "moment",
    glyph: "gift",
    name,
    words: "Every 30 days, to a yes to offers",
    stateWords: "Off",
    tone: "plain",
    open: turnOn,
    act: turnOn,
    channels: [],
  };
}

/** A reach-out: a chain of cold emails to a search's leads, one line. It goes by email, which its own sheet judges. */
function chainStrip(c: NonNullable<LifecycleInput["reachOuts"]>[number], ready: ChannelsReady | null): LifecycleStrip {
  const open: LifecycleAct = { kind: "open", label: "Open", playbookId: c.root_id };
  const paused = c.state !== "running";
  const waiting = !paused && !!c.next.waiting_run_id;
  return {
    id: c.root_id,
    kind: "reach_out",
    glyph: "send",
    name: c.name,
    words: `Cold email${c.search ? ` to ${c.search.name}` : ""} · ${plural(c.steps.length, "step")}`,
    stateWords: paused ? "Paused" : waiting ? "Waiting on you" : "On",
    tone: paused || waiting ? "warn" : "ok",
    open,
    act: paused ? { kind: "resume", label: "Resume", playbookId: c.root_id } : open,
    channels: chainMarksOf(ready),
  };
}

/**
 * Every playbook or campaign that is not one of the five moments, one quiet line each: the call's text, the month's
 * offer, the playbooks on a list and any other that still runs (a welcome made before it was retired), then the reach-outs.
 */
function lifecycleStrips(input: LifecycleInput, stages: readonly LifecycleStage[]): LifecycleStrip[] {
  const out: LifecycleStrip[] = [callTextStrip(input.library)];
  const playbooks = input.playbooks;
  const ready = readyOf(input);
  if (playbooks) {
    const month = monthsOfferStrip(playbooks, ready);
    if (month) out.push(month);
    const onStage = new Set(stages.flatMap((s) => (s.playbookId ? [s.playbookId] : [])));
    const rest = playbooks.rows.filter((p) => !onStage.has(p.id) && p.trigger !== "everyone_monthly");
    const marks = (p: LifecyclePlaybook) => channelMarksOf(p, playbooks.templates, ready);
    for (const p of rest.filter((r) => r.trigger === "saved_list")) {
      out.push(stripOfPlaybook(p, "list", "bolt", `On a list · ${p.triggerLabel}`, marks(p)));
    }
    for (const p of rest.filter((r) => r.trigger !== "saved_list")) {
      out.push(stripOfPlaybook(p, "moment", "bolt", triggerOf(p.trigger)?.hint ?? p.triggerLabel, marks(p)));
    }
  }
  for (const c of input.reachOuts ?? []) out.push(chainStrip(c, ready));
  return out;
}

/** The emails reach-outs write, as the Library lists them: none where the chains are unread or could not be read, as that page has it. */
function emailRowsOf(reachOuts: LifecycleInput["reachOuts"]): number {
  return reachOuts ? emailTemplateRowsOf(reachOuts).length : 0;
}

/**
 * The head: the name, the line under it, the channels the workspace stands on, and the page's two acts. The line is facts
 * alone (what the lede explained every visit, the rail now shows): how many moments are covered, and how many people can
 * hear from you.
 */
function lifecycleHeadOf(input: LifecycleInput, stages: readonly LifecycleStage[]): LifecycleHead {
  const covered = stages.filter((s) => s.covered).length;
  const reach = input.broadcasts?.reach ?? null;
  const parts: Array<string | { b: string }> = [];
  if (stages.length > 0) {
    parts.push({ b: `${covered} of ${stages.length}` }, " moments are covered");
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

/** What the drawer calls a moment: its stage's words ("Quiet or lapsed"), else the kind of line it is, else just a moment. */
export function lifecycleKicker(home: LifecycleHome, id: string): string {
  const stage = home.rail.stages.find((s) => s.playbookId === id);
  if (stage) return stage.caps;
  const line = home.strips.find((s) => s.id === id);
  return line ? LIFECYCLE_WORDS.kickers[line.kind] : "Moment";
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
    report: b && b.report === null ? F.report : null,
    reach: b === null || (b !== undefined && !b.reach) ? F.reach : null,
    coming: b === null ? F.coming : null,
    results: b === null ? F.results : null,
  };
}

/** The whole home: the head, the rail, the strips under it, the three tiles, and what could not be read. */
export function campaignsHomeOf(input: LifecycleInput): LifecycleHome {
  const stages = input.playbooks ? lifecycleStages(input.playbooks, hasLine(input.broadcasts), readyOf(input)) : [];
  const covered = stages.filter((s) => s.covered).length;
  return {
    head: lifecycleHeadOf(input, stages),
    rail: {
      title: LIFECYCLE_WORDS.rail,
      coveredWords: stages.length > 0 ? `${covered} of ${stages.length} moments covered` : null,
      phoneWords: stages.length > 0 ? `${covered} of ${stages.length} on` : null,
      stages,
    },
    strips: lifecycleStrips(input, stages),
    reach: lifecycleReach(input, stages),
    coming: lifecycleComing(input, stages),
    results: lifecycleResults(input),
    failed: failedOf(input),
  };
}
