/**
 * The lead sheet (canvas B v2, "The Workbench", made the lead's panel everywhere on Leads, 16 Oct 2026): one lead as a
 * card to decide on at half height and five tabs to read at full, beside the rows on a desk and over them on a phone,
 * in a pile and out of one. Which of the canvas's states the lead is in, what the card's parts say, and what the rail's
 * three places hold are decided here, from the lead's own facts, the add door's answer (lead-card.ts LeadCardCheck)
 * and its story with a sequence. The rail never offers a press that would fail. Every sentence the sheet says is here or
 * in lead-card.ts.
 *
 *   leadSheetStateOf     which state: needs review, finding an email, a phone and no email, a gap, in another sequence,
 *                        in a sequence, they replied, closed, or ready
 *   leadSheetClosedOf    what stopped, in words, and the one fix that exists
 *   leadSheetEndRailOf   the acts at the end of a pile (the dock's for a lead: lead-sheet-dock.ts)
 *   leadSheetTrackOf     their steps in the sequence they are in: done, next, and still to come
 *   leadSheetOptionsOf   Change, opened in place: each sequence the adds could go to, and what it would come to here
 *   leadSheetReasonsOf   the reasons to write now, the listing's own signals
 *   leadSheetAboutOf     the place or the company as its source knows it, each fact with where it came from
 *   leadSheetStandOf     where they stand with a sequence, for Activity
 */
import { capitalize, plural } from "../../shared/words";
import { clockDate, clockNear } from "../../shared/clock";
import { reachOutStandingOf, type ReachOutLeadTimelineDto } from "../../reach-out/reach-out-leads";
import type { ReachOutChainDto } from "../../reach-out/reach-out-dtos";
import { leadCardEmailOf, type LeadCardCheck, type LeadCardEmailVM, type LeadCardLead } from "../lead-card";
import type { SlotWorkspace } from "../../reach-out/reach-out-rules";
import type { LeadPeekVM } from "../lead-peek";
import { LEAD_CLOSED_WORDS, LEAD_LEFT_OUT_WORD, type LeadClass, type LeadStage } from "../lead-words";
import type { LeadEmailState } from "../search/sets";

/* ------------------------------------------------------------------------------------------------ the words -- */

/** The sheet's words: its head, its tabs' headings, its blocks, and its handle. */
export const LEAD_SHEET_WORDS = {
  tabs: "About this lead",
  raise: "Show everything about them",
  lower: "Back to the card",
  close: "Close",
  more: "More for this lead",
  stage: "Stage",
  why: {
    reasons: "Reasons to write now",
    people: "People here",
  },
  reach: { head: "Ways to reach them", sub: "best first", others: "Other addresses on their site" },
  emails: {
    steps: "The steps",
    vars: (name: string) => `Its variables, for ${name}`,
    to: "To",
    from: "From",
    when: "When",
    none: "Choose a sequence to see what they would get.",
  },
  about: { links: "Their links", hours: "Their week" },
  /** The three tabs' own headings and doors (the refined canvas). */
  panes: {
    listing: "From the listing",
    company: "The company",
    writesTo: "The sequence writes to",
    where: "Where they are",
    steps: "Their steps",
    everyStep: (name: string) => `Every step, and who else is in it: ${name}`,
    takeOut: "Take out",
    wentOut: "What went out",
    takeOutLine: "Only of this sequence; Put back undoes. Stop writing to them anywhere is in the ⋯.",
  },
  activity: { stand: "In a sequence", found: "How it was found" },
  change: "Change",
  done: "Done",
  choose: (name: string) => `Which sequence, for ${name}`,
  /** Change's way into Sequences (the refined canvas): a version of the one chosen, or a new one, and back here. */
  versionOf: (name: string) => `Make a version of ${name}`,
  versionHint: "The same steps and mailboxes, a new first email, its own list. Made in Sequences.",
  newSequence: "New sequence",
  newSequenceHint: "Starts in Sequences with this lead, and comes back",
  chooseFootPile: "Used for the rest of this pile. A sequence fed by its own search takes its leads by itself.",
  chooseFoot: "Used for the leads you open next. A sequence fed by its own search takes its leads by itself.",
  fills: "Every field fills",
  greets: "Greets them as “there”",
  needs: (labels: string) => `Needs ${labels}`,
  emailOf: (name: string) => `${name} · email 1`,
  modeFirst: "No sequence takes leads you add yet. Add the ones you'd write to; you write to them once, at the end.",
  modeSearch: (name: string) =>
    `This search has “${name}”, so every ready lead here goes. Not a fit is how one stays out.`,
  goesWith: (name: string) => `Goes with “${name}”`,
  phoneOnly: "No email found",
  phoneOnlyLine: "There's a number to call. Call saves what was said and moves on.",
  elsewhereIn: (name: string) => `In “${name}”`,
  elsewhereLine: "A business is written to once, so this one stays with that sequence.",
  inSequence: (name: string) => `In “${name}”`,
  stopped: "The sequence stopped",
  stoppedLine: "They wrote back, so nothing more goes. Answer them in the Inbox.",
  wroteBack: "They wrote back",
  endTitle: (decided: number) => (decided ? `All ${decided} decided.` : "Nothing left to look at."),
  endAdded: (name: string) => `Added to “${name}”`,
  endHeld: "On your new list",
  endLater: "For later",
  endNotFit: "Not a fit",
  endNote: "Its next batch waits for your OK, because it carries leads you added.",
  endNoteFirst: "Next, write what they get. Nothing goes until you approve its first batch.",
  next: "Next",
  later: "Later",
  notFit: "Not a fit",
  add: "Add",
  hold: "Add to a new list",
  keep: "Keep",
  exclude: "Leave out",
  call: "Call",
  draft: "Draft an email",
  openIt: "Open it",
  itsSequence: "Its sequence",
  stop: "Stop writing",
  thread: "Open the thread",
  putBack: "Put back",
  ready: "Move back to Ready",
  laterAgain: (n: number) => `Later · ${n}`,
  leave: "Done for now",
  writeHeld: (n: number) => `Write to the ${n}`,
  openTarget: "Open the sequence",
  approveIn: (name: string) => `Approve in ${name}`,
  noTarget: "No sequence takes leads you add yet: start one from New message.",
  keepSub: (left: number) => `Counts this month · ${left} left`,
  back: "Back",
  hides: "Hides it from every search",
  lastWhy: "Your last reason",
  copyAll: "Copy everything",
  copied: "Copied what is known of them",
} as const;

/* ------------------------------------------------------------------------------------------------- the state -- */

/** The canvas's states (its "Twelve states" board, less the pile's own: the end, and a search that already writes). */
export type LeadSheetState =
  "review" | "finding" | "phone" | "gap" | "elsewhere" | "sequence" | "replied" | "closed" | "ready";

/** What the state is read from: the lead as the rows read it, and the two ways to them. */
export interface LeadSheetLead {
  cls: LeadClass;
  stage: LeadStage;
  emailState: LeadEmailState;
  hasEmail: boolean;
  canCall: boolean;
  /** In a sequence already (lead_chain_of: one lead, one sequence). */
  inSequence: boolean;
}

/** What their story with a sequence says, where there is one (reach_out_lead_timeline). */
export interface LeadSheetStory {
  replied: boolean;
  bounced: boolean;
}

/** The reasons that are an address the door gave: a call or a gap, by whether a number is there. */
const ADDRESS_WHYS = new Set(["no_email", "invalid"]);
/** The reasons that are the sequence's own setting: its words fill, the address can't be confirmed or checked. */
const SETTING_WHYS = new Set(["unconfirmed", "unchecked"]);

/** A state the lead's own record settles before anything is asked: left out, in review, talking, closed, in a sequence. */
function settledOf(lead: LeadSheetLead, story: LeadSheetStory | null): LeadSheetState | null {
  if (lead.cls === "excluded") return "closed";
  if (lead.cls === "review") return "review";
  if (lead.stage === "converted" || (story && story.replied)) return "replied";
  if (lead.stage === "archived" || (story && story.bounced)) return "closed";
  return lead.inSequence ? "sequence" : null;
}

/** A state the add door's answer settles: another sequence, already on this one, an address, a setting, or no. */
function checkStateOf(check: LeadCardCheck | undefined, lead: LeadSheetLead): LeadSheetState | null {
  if (!check) return null;
  if (check.why === "elsewhere") return "elsewhere";
  if (check.why === "already") return "sequence";
  if (check.why === "checking") return "finding";
  if (ADDRESS_WHYS.has(check.why)) return lead.canCall ? "phone" : "closed";
  return SETTING_WHYS.has(check.why) ? "gap" : "closed";
}

/**
 * Which state the lead is in, by what is known of it in this order: its own record, the add door's answer (the one
 * predicate, never a second reading of the address here), then what the card's email says (a fallback or a hole).
 */
export function leadSheetStateOf(p: {
  lead: LeadSheetLead;
  check: LeadCardCheck | undefined;
  email: Pick<LeadCardEmailVM, "blocked" | "note"> | null;
  story: LeadSheetStory | null;
}): LeadSheetState {
  const settled = settledOf(p.lead, p.story) ?? checkStateOf(p.check, p.lead);
  if (settled) return settled;
  if (!p.lead.hasEmail || p.lead.emailState === "invalid") return p.lead.canCall ? "phone" : "closed";
  if (p.lead.emailState === "checking") return "finding";
  return p.email && (p.email.blocked || p.email.note) ? "gap" : "ready";
}

/** What stopped, as a closed card says it, and the one fix that exists for it (none, where none does). */
export interface LeadSheetClosedVM {
  title: string;
  line: string;
  fix: "put_back" | "ready" | "call" | null;
}

/** What a closed card says: left out, closed with its reason, bounced, or what the door said. */
export function leadSheetClosedOf(p: {
  lead: LeadSheetLead;
  closedReason: string | null;
  blocked: string | null;
}): LeadSheetClosedVM {
  const call = p.lead.canCall ? "call" : null;
  if (p.lead.cls === "excluded")
    return {
      title: LEAD_LEFT_OUT_WORD,
      line: "Left out of this search. Put back brings it in again.",
      fix: "put_back",
    };
  if (p.lead.stage === "archived") {
    const word =
      p.closedReason && p.closedReason in LEAD_CLOSED_WORDS
        ? LEAD_CLOSED_WORDS[p.closedReason as keyof typeof LEAD_CLOSED_WORDS]
        : "Closed";
    return { title: word, line: "Closed: nothing is written to them.", fix: "ready" };
  }
  if (p.lead.emailState === "invalid")
    return { title: "Their address bounced", line: "Nothing more goes to it.", fix: call };
  if (!p.lead.hasEmail && !p.lead.canCall)
    return { title: "No way to reach them yet", line: "No address and no number were found.", fix: null };
  return { title: "Can't be written to", line: p.blocked ?? "This one can't be added.", fix: call };
}

/* --------------------------------------------------------------------------------------------------- the rail -- */

/** What a place on the rail does. */
export type LeadSheetAct =
  | "not_a_fit"
  | "later"
  | "add"
  | "hold"
  | "keep"
  | "exclude"
  | "call"
  | "draft"
  | "next"
  | "sequence"
  | "stop"
  | "thread"
  | "put_back"
  | "ready"
  | "later_again"
  | "leave"
  | "write_held"
  | "open_target"
  /** The dock (the refined canvas): Approve in the record, Decide a held email here, Open the draft, a new sequence. */
  | "approve"
  | "decide"
  | "open_draft"
  | "new_sequence";

/** One place on the rail: what it does, its words and glyph, its key, a second line, and why it is off. */
export interface LeadSheetSlotVM {
  act: LeadSheetAct;
  label: string;
  icon: string;
  key: "a" | "l" | "n" | "c" | "j" | null;
  sub: string | null;
  /** Why it is off, said at the control; null when it would go. */
  off: string | null;
}

/** A row of acts (the pile's end): the last is always the primary. */
export interface LeadSheetRailVM {
  x: boolean;
  slots: LeadSheetSlotVM[];
}

const slot = (act: LeadSheetAct, label: string, icon: string, key: LeadSheetSlotVM["key"] = null): LeadSheetSlotVM => ({
  act,
  label,
  icon,
  key,
  sub: null,
  off: null,
});

const SW = LEAD_SHEET_WORDS;
/** The rail at the end of a pile: the later ones, the way out, and where the work lands. */
export function leadSheetEndRailOf(p: { later: number; held: number; target: string | null }): LeadSheetRailVM {
  const last = p.held
    ? slot("write_held", SW.writeHeld(p.held), "send")
    : p.target
      ? slot("open_target", SW.approveIn(p.target), "chevron")
      : slot("leave", SW.leave, "check");
  return {
    x: false,
    slots: [
      ...(p.later > 0 ? [slot("later_again", SW.laterAgain(p.later), "clock")] : []),
      ...(last.act === "leave" ? [] : [slot("leave", SW.leave, "x")]),
      last,
    ],
  };
}

/* ------------------------------------------------------------------------------------------ a sequence's steps -- */

/** One step of theirs in a sequence: its day and name, when, and whether it went, goes next or is still to come. */
export interface LeadSheetStepVM {
  n: number;
  /** Its day in the sequence, as the record's rail says it: Day 1, then each wait added. */
  day: number;
  label: string;
  sub: string;
  when: string;
  look: "done" | "next" | "later";
}

/** Their steps in the sequence they are in, and the one line every page says of where they stand. */
export interface LeadSheetTrackVM {
  name: string;
  rootId: string;
  steps: LeadSheetStepVM[];
  line: string | null;
}

/** A step's name, as the record says it: the first email, a follow-up, or a call or a note for the team. */
const stepLabel = (n: number, hand: string | null) =>
  hand === "call" ? "A call for you" : hand === "note" ? "A note for you" : n === 0 ? "First email" : "Follow-up";

/** One step, by its sends: gone (or bounced), planned, or still to come after its wait. */
function sheetStepOf(
  s: { n: number; after_days: number | null; hand: string | null },
  day: number,
  t: ReachOutLeadTimelineDto,
  clock: { nowMs: number; tz: string },
): LeadSheetStepVM {
  const sends = t.sends.filter((x) => x.n === s.n);
  const gone = sends.find((x) => x.sent_at || x.left);
  const label = stepLabel(s.n, s.hand);
  if (gone) {
    const at = gone.sent_at ? Date.parse(gone.sent_at) : NaN;
    const when = Number.isFinite(at) ? clockDate(at, clock.tz, clock.nowMs) : "";
    return { n: s.n, day, label, sub: gone.bounced ? "Bounced" : "Sent", when, look: "done" };
  }
  const planned = sends.find((x) => x.send_at);
  const at = planned && planned.send_at ? Date.parse(planned.send_at) : NaN;
  if (Number.isFinite(at))
    return { n: s.n, day, label, sub: "Planned", when: clockNear(at, clock.tz, clock.nowMs), look: "next" };
  const wait = s.after_days ? `+${plural(s.after_days, "day", "days")}` : "";
  return {
    n: s.n,
    day,
    label,
    sub: s.n === 0 ? "In its next batch" : "If nothing comes back",
    when: wait,
    look: "later",
  };
}

/**
 * Their steps in their sequence (canvas B, "In a reach-out"): each step from the chain, marked by what its sends did;
 * the first still to come is next where nothing is planned. Null without a sequence.
 */
export function leadSheetTrackOf(t: ReachOutLeadTimelineDto, nowMs: number, tz: string): LeadSheetTrackVM | null {
  if (!t.chain) return null;
  const known =
    t.chain.steps ??
    [...new Set(t.sends.map((s) => s.n).filter((n): n is number => n !== null))].map((n) => ({
      n,
      after_days: null,
      hand: null,
    }));
  // Each step's day, as the record's rail counts it: Day 1, then each wait added.
  let day = 1;
  const steps = [...known]
    .sort((a, b) => a.n - b.n)
    .map((s) => {
      if (s.n > 0) day += s.after_days ?? 0;
      return sheetStepOf(s, day, t, { nowMs, tz });
    });
  // The first still to come is next, where no step is already.
  const later = steps.find((s) => s.look === "later");
  if (later && !steps.some((s) => s.look === "next")) later.look = "next";
  const standing = reachOutStandingOf(t, nowMs, tz);
  return { name: t.chain.name, rootId: t.chain.root_id, steps, line: standing ? capitalize(standing.line) : null };
}

/** What their story says for the state: they replied, or an email bounced. */
export function leadSheetStoryOf(t: ReachOutLeadTimelineDto | null): LeadSheetStory | null {
  if (!t) return null;
  return {
    replied: t.readings.some((r) => !r.undone && r.claim !== "auto_reply"),
    bounced: t.sends.some((s) => s.bounced),
  };
}

/** What they wrote back, as the reply was read: its summary, never their words made up. Null before any reply. */
export function leadSheetReplyOf(t: ReachOutLeadTimelineDto | null): string | null {
  if (!t) return null;
  const r = [...t.readings].reverse().find((x) => !x.undone && x.claim !== "auto_reply");
  return r && r.summary ? r.summary : null;
}

/* ------------------------------------------------------------------------------------------ Change, in place -- */

/** One sequence the adds could go to, as Change lists it: its name, its email's shape, and what it would come to. */
export interface LeadSheetOptionVM {
  rootId: string;
  name: string;
  meta: string;
  fill: string;
  tone: "ok" | "warn";
  on: boolean;
}

/**
 * Change, opened in place (canvas B: "each option says only what the engine knows"): each sequence fed by a list, with
 * its first email filled for this lead by the send's own fill: every field fills, it greets them as “there”, or the
 * value it needs. A sequence fed by its own search takes its leads by itself and is not offered.
 */
export function leadSheetOptionsOf(p: {
  chains: readonly ReachOutChainDto[];
  picked: string | null;
  lead: LeadCardLead | null;
  workspace: SlotWorkspace;
  nowMs: number;
  tz: string;
}): LeadSheetOptionVM[] {
  return p.chains.map((c) => {
    const email = p.lead
      ? leadCardEmailOf({ chain: c, lead: p.lead, workspace: p.workspace, nowMs: p.nowMs, tz: p.tz })
      : null;
    const holes = email && email.blocked ? email.blocked : null;
    const steps = c.steps.filter((s) => !s.hand).length;
    return {
      rootId: c.root_id,
      name: c.name,
      meta: `${plural(steps, "email", "emails")} · ${c.owner_sends ? "from your own inbox" : "from your mailboxes"}`,
      fill: holes ? holes : email && email.note ? SW.greets : SW.fills,
      tone: holes ? "warn" : "ok",
      on: c.root_id === p.picked,
    };
  });
}

/* --------------------------------------------------------------------------------------------- the tabs' facts -- */

/** A reason to write now: what the listing shows, its dot, and where it came from. */
export interface LeadSheetReasonVM {
  text: string;
  tone: "warn" | "info";
  from: string;
}

/** The reasons to write now (Why): the listing's own signals, a low-star share and an unclaimed listing. */
export function leadSheetReasonsOf(vm: Pick<LeadPeekVM, "rated" | "claimedNote" | "company">): LeadSheetReasonVM[] {
  if (vm.company) return [];
  return [
    ...(vm.rated && vm.rated.low ? [{ text: vm.rated.low, tone: "warn" as const, from: "its listing" }] : []),
    ...(vm.claimedNote ? [{ text: "Listing not claimed", tone: "info" as const, from: "its listing" }] : []),
  ];
}

/** A fact about them, and where it came from. */
export interface LeadSheetFactVM {
  k: string;
  v: string;
  from: string | null;
}

/** The place or the company as its source knows it (About): each fact with its source, nothing its source didn't say. */
export function leadSheetAboutOf(
  vm: Pick<LeadPeekVM, "rated" | "weekSummary" | "where" | "distance" | "facts" | "company" | "about">,
): { head: string; from: string; rows: LeadSheetFactVM[] } {
  const listing = vm.company ? vm.company.source : "its listing";
  const rows: LeadSheetFactVM[] = [
    ...(vm.rated
      ? [
          {
            k: "Rating",
            v: [vm.rated.score, vm.rated.reviews, vm.rated.low].filter(Boolean).join(" · "),
            from: "listing",
          },
        ]
      : []),
    ...(vm.weekSummary ? [{ k: "Hours", v: vm.weekSummary, from: "listing" }] : []),
    ...(vm.where ? [{ k: "Address", v: vm.where.line, from: vm.distance || null }] : []),
    ...(vm.about ? [{ k: "About", v: vm.about, from: null }] : []),
    // The listing's own facts, each said once: the rating is the row above, with its low share.
    ...vm.facts.filter((f) => !(vm.rated && f.k === "Rated")).map((f) => ({ k: f.k, v: f.v, from: null })),
  ];
  return { head: vm.company ? "The company" : "The place", from: vm.company ? listing : "its listing", rows };
}

/** Where they stand with a sequence, for Activity: in one by name and its line, or not yet and what Add would do. */
export function leadSheetStandOf(p: {
  track: LeadSheetTrackVM | null;
  state: LeadSheetState;
  target: string | null;
  searchWrites: string | null;
  closed: LeadSheetClosedVM | null;
}): { title: string; line: string } {
  if (p.track) return { title: SW.inSequence(p.track.name), line: p.track.line ?? "" };
  if (p.state === "closed" && p.closed) return { title: p.closed.title, line: p.closed.line };
  if (p.searchWrites)
    return { title: "Not in a sequence yet", line: `${SW.goesWith(p.searchWrites)} in its next batch.` };
  return {
    title: "Not in a sequence yet",
    line: p.target ? `Add puts it on “${p.target}”'s list; it goes in its next batch.` : SW.noTarget,
  };
}
