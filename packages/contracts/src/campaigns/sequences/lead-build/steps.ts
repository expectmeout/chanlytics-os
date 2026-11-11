/** Lead build: steps. */

import type { ReachOutChainDto } from "../../reach-out/dtos";
import type { ReachOutDraft, ReachOutDraftStep } from "../../reach-out/draft";
import {
  REACH_OUT_DRAFTS_PER_DAY,
  reachOutCardSlotsOf,
  type SlotLead,
  type SlotWorkspace,
} from "../../reach-out/rules";
import { chainPaceOf } from "../../reach-out/sheet/chain";
import { REACH_OUT_AFTER_DAYS, REACH_OUT_STEPS_MAX } from "../../reach-out/words/limits";
import { dateFormat } from "../../../shared/time";
import { REACH_OUT_SLOT_SET, type ReachOutSlot } from "../../reach-out/words/slots";
import { plural } from "../../../shared/words";
import { slotMentions } from "../../templates/slot-sets";
import { SEQUENCE_MODE_LABEL } from "../sequence";
import { SCHEDULE_WORDS } from "../schedule";

/** How much an owner may say of what should change in an email, as Change it with Ask holds a draft's instruction. */
export const LEAD_REWRITE_CHANGE_MAX = 280;

/** What POST sequences/:id/rewrite answers: the email written again, for the sheet's box, and what it left out. */
export interface LeadRewriteDto {
  subject: string | null;
  body: string;
  cannot: string | null;
}

/** The record's words for a sequence to leads, said once. */
export const LEAD_BUILD_WORDS = {
  /** Beside a step's words: who a change to them does not reach (decision 0096). */
  keepOwn: (n: number) => `${plural(n, "lead keeps", "leads keep")} their own words.`,
  /** Beside a lead previewed who has them. */
  ownWords: "They have their own words here.",
  /** The Start row: who joins, then the line under it. */
  startAdd: "When you add a lead",
  startFound: "When a lead is ready in ",
  inIt: (n: number) => `${n} in it`,
  pace: (share: number, owner: boolean) => `up to ${share} a day, from ${owner ? "your inbox" : "your mailboxes"}`,
  noMailbox: "no mailbox to send from yet",
  /** The Start row's act, every sequence's (the one record): its sheet's own title. */
  howItRuns: SCHEDULE_WORDS.settings.title,
  /** A step's box. */
  firstEmail: "First email",
  followUp: "Following up",
  notWritten: "Not written yet",
  call: "Call them",
  note: "A note for you",
  callLine: "A task on their page, due that day · always last",
  /** The dock of a draft with an email still to write. */
  unwritten: (place: number) => `Step ${place} isn’t written yet`,
  thenStart: "Then Start",
  write: (place: number) => `Write step ${place}`,
  /** Start refused while an email is still to write: the door's words. */
  writeFirst: (place: number) => `Step ${place} isn’t written yet. Write it, then Start.`,
  /** A step's sheet. */
  stepTitle: (place: number, hand: "call" | "note" | null) =>
    `Step ${place} · ${hand === "call" ? "Call" : hand === "note" ? "Note" : "Email"}`,
  stepSub: (day: number, people: number) =>
    people > 0 ? `Day ${day} · to ${plural(people, "lead", "leads")}` : `Day ${day} · nobody in it yet`,
  done: "Done",
  subject: "Subject",
  email: "Email",
  inThread: "It answers the email before it, in the same thread: no subject.",
  insert: "Insert",
  askRewrites: "Ask rewrites it",
  rewriteChange: "What should change?",
  rewriteGo: "Rewrite",
  rewriteGoing: "Rewriting…",
  rewriteUndo: "Undo",
  rewriteLong: `At most ${LEAD_REWRITE_CHANGE_MAX} characters.`,
  rewriteBroke: "That rewrite broke a cold email rule, so your email stayed as it was. Say it another way.",
  rewriteLostOpening: "That rewrite dropped the opening, so your email stayed as it was. Try again.",
  rewriteFailed: "Ask couldn’t rewrite it just now. Try again.",
  preview: "Preview",
  holdsOne: "A value that can’t be filled holds that one email for you.",
  aboutThem: "About them",
  aboutYou: "About you",
  whenFound: "when found",
  writtenForEach: "written for each",
  /** {{their preview}} (decision 0079): made at the first email that names it. */
  previewMade: "made when it goes",
  /** Why a step offers no {{their preview}}: a first email carries no link, and a company takes no bookings. */
  previewLater: "Their receptionist goes in a later email: a first email carries no link.",
  previewNotForCompanies: "Their receptionist is for a business that takes bookings, so a company gets none.",
  notSet: "not set",
  add: "Add",
  waits: "Waits",
  afterDays: (n: number) => plural(n, "day", "days"),
  onlyIfQuiet: "Then only if they haven’t written back",
  removeStep: "Take this step out",
  stepOut: (place: number) => `Step ${place} taken out`,
  handWords: "What to do",
  handHint: "Said on their page the day it comes due.",
  saving: "Saving…",
  saved: "Saved as you change it",
  /** The booking link put in from the step: Settings keeps it. */
  bookingLink: "Your booking link",
  bookingSave: "Save to Settings",
  bookingSaved: "Booking link saved",
  /**
   * Preview as a real lead: the step named once, in the head (the phone pass, 3 Nov 2026: "Step 1" stood in the head's
   * line, the way back, the pager and the foot), the way back to its words, and the lead walked.
   */
  previewTitle: (place: number) => `Preview · Step ${place}`,
  previewBack: "Edit",
  previewOf: (name: string, at: number, of: number) => `${name} · ${at} of ${of}`,
  yourInbox: "your inbox",
  prev: "Previous lead",
  next: "Next lead",
  example: "An example business: nobody is in it yet",
  /** Beside Send me a test, on its line: where the test goes (the button says the rest). */
  testFact: "To your inbox",
  heldLine: (n: number) => `${plural(n, "email", "emails")} held for you`,
  /** What holds the email previewed: a value they lack, or one of yours not set. */
  theyLack: (labels: string[]) => `They have no ${labels.join(" or ")}, so this email would wait for you.`,
  youUnset: (labels: string[]) => `${labels.join(" and ")} isn’t set, so every email that names it waits for you.`,
  show: "Show",
  /** How it runs. */
  runs: {
    title: "How it runs",
    sub: "Saved as you change it",
    who: "Who joins",
    unconfirmed: "Write to unconfirmed addresses too",
    heldNow: (n: number) => `${n} held now`,
    autoAdd: "Add new ready leads from the search",
    noSearch: "It was made from a list, not a search",
    sending: "Sending",
    sendsFrom: "Sends from",
    inbox: "Your inbox · you send",
    mailboxes: (n: number) =>
      n === 0 ? "Your mailboxes · none yet" : n === 1 ? "Your mailbox" : `Your ${n} mailboxes`,
    /** Saved to send from the mailboxes, and none sends now: nothing goes until one does, or it changes. */
    noneSends: "No mailbox sends now, so nothing goes. Connect one on Settings › Cold email.",
    /** Saved for the owner to send, with a mailbox that could send for them now. */
    canSwitch: (n: number) =>
      `${n === 1 ? "Your mailbox is" : `Your ${n} mailboxes are`} connected: choose ${n === 1 ? "it" : "them"} to send these for you.`,
    connect: "Connect a mailbox",
    aDay: "A day, at most",
    every: (minutes: number) => `one every ${minutes} min or so`,
    youPace: "You send each, so you are the pace",
    /** Saved to send from the mailboxes, with none sending now. */
    noneDay: "None until a mailbox sends",
    approves: SEQUENCE_MODE_LABEL,
    newWordsAsk: "New words always ask first",
    signed: "Signed",
    signedNone: "Not set",
    footer: "Footer",
    footerValue: "Why they hear from you",
    noAddress: "Add your address in Settings › Details: every email carries it at the foot.",
    /** The mailboxes it writes from (0077, D4): a tick each, one always kept. */
    everyMailbox: "Every mailbox, and any you connect later",
    keepOne: "One has to send. To stop them all, pause the sequence.",
    newMailbox: "New",
    dnsMissing: (records: readonly string[]) => `${records.map((r) => r.toUpperCase()).join(" and ")} missing`,
    setUpDns: "Set up DNS",
    notSending: { paused: "Paused", held: "Held", reconnect: "Signed out", resting: "Done for today" },
    /** A mailbox's day, and the top its ramp climbs to while it is still climbing (never a second "new" beside New). */
    day: (perDay: number, top: number) => (perDay < top ? `${perDay} a day, rising to ${top}` : `${perDay} a day`),
    /** How its emails end (0077, D10). */
    endsWith: "Ends with",
    endsName: (name: string) => (name.trim() ? `“${name.trim()}”` : "Your name"),
    endsSignature: (address: string) => `${address}'s signature`,
    signatureHasLink: "Its link stays out of first emails, and of any that has a link already.",
    noName: "Write the name it ends with.",
    /** When no one answers (decision 0120, D6): off unless its owner turns it on. */
    noAnswer: "When no one answers",
    again: "Try again after 90 days",
    once: "Written to once. This stays off unless you turn it on.",
    againOn:
      "With new words, written from their listing as it is then. Never to anyone who said no, became a customer, or asked to be erased.",
    againAsks: "The new words wait for your OK first, like any new words.",
    /** Who would come back, and from when: "8 businesses would come back in February." */
    comeBack: (n: number, month: string | null) =>
      n === 0
        ? "Nobody it wrote to would come back yet."
        : `${n} ${n === 1 ? "business" : "businesses"} would come back${month ? ` in ${month}` : ""}.`,
  },
} as const;

/** How long a business that never answered waits before a sequence that tries again writes once more (decision 0120). */
export const REACH_OUT_AGAIN_DAYS = 90;

/** The month the first business tried again comes back in, by the business's clock: "February"; null with none. */
export function againMonthOf(firstAt: string | null | undefined, tz: string): string | null {
  const ms = firstAt ? Date.parse(firstAt) : Number.NaN;
  return Number.isFinite(ms) ? dateFormat("en-US", { timeZone: tz, month: "long" }).format(new Date(ms)) : null;
}

/** A step's words cut into words and slots by name: a box's title and its lines, as the editor's chips name them. */
export type LeadBuildPart = { kind: "text"; text: string } | { kind: "slot"; key: string; label: string };

/** The editor's name for a slot ("Their business"), by its key. */
export const leadSlotLabel = (key: string): string =>
  REACH_OUT_SLOT_SET.labels[REACH_OUT_SLOT_SET.keys.indexOf(key)] ?? key;

/** Words with each slot named as the editor names it, the rest as written. */
function leadBuildPartsOf(text: string): LeadBuildPart[] {
  const parts: LeadBuildPart[] = [];
  let from = 0;
  for (const m of slotMentions(REACH_OUT_SLOT_SET, text)) {
    if (m.index > from) parts.push({ kind: "text", text: text.slice(from, m.index) });
    parts.push({ kind: "slot", key: m.key, label: leadSlotLabel(m.key) });
    from = m.index + m.written.length;
  }
  if (from < text.length) parts.push({ kind: "text", text: text.slice(from) });
  return parts;
}

/** Whether a step is an email still to write: one with no words yet (a draft keeps it; Start asks for it). */
const leadStepUnwritten = (s: { hand?: unknown; body: string }): boolean => !s.hand && !s.body.trim();

/** The first email still to write, by its place (from 1), or null where every email is written. */
export function leadFirstUnwritten(steps: ReadonlyArray<{ hand?: unknown; body: string }>): number | null {
  const at = steps.findIndex(leadStepUnwritten);
  return at < 0 ? null : at + 1;
}

/** One step's box on the record, as a sequence to leads draws it. */
export interface LeadBuildStepVM {
  place: number;
  /** The subject's words with their slots by name (the first email), or the step's own name. */
  title: LeadBuildPart[];
  /** The title in words, for a screen reader. */
  named: string;
  /** Its email's words, a few lines of them; null for a call and an email still to write. */
  pre: LeadBuildPart[] | null;
  unwritten: boolean;
  hand: "call" | "note" | null;
}

/** The title said in words: slots by their names. */
const partsWords = (parts: readonly LeadBuildPart[]): string =>
  parts
    .map((p) => (p.kind === "text" ? p.text : p.label))
    .join("")
    .trim();

/**
 * Each step's box, by its id: the first email by its subject, each after it as the follow-up it is (it answers in the same
 * thread), a call or a note by what it is, with what it says or that it is still to write.
 */
export function leadBuildStepsOf(chain: Pick<ReachOutChainDto, "steps">): Map<string, LeadBuildStepVM> {
  const out = new Map<string, LeadBuildStepVM>();
  for (const text of [...chain.steps].sort((a, b) => a.n - b.n)) {
    const hand = text.hand?.kind ?? null;
    const unwritten = leadStepUnwritten(text);
    const subject = text.n === 0 && text.subject?.trim() ? leadBuildPartsOf(text.subject) : null;
    const title: LeadBuildPart[] = subject ?? [
      {
        kind: "text",
        text:
          hand === "call"
            ? LEAD_BUILD_WORDS.call
            : hand === "note"
              ? LEAD_BUILD_WORDS.note
              : text.n === 0
                ? LEAD_BUILD_WORDS.firstEmail
                : LEAD_BUILD_WORDS.followUp,
      },
    ];
    out.set(text.id, {
      place: text.n + 1,
      title,
      named: partsWords(title),
      pre: hand || unwritten ? null : leadBuildPartsOf(text.body.replace(/\s*\n+\s*/g, " ").trim()),
      unwritten,
      hand,
    });
  }
  return out;
}

/**
 * The draft with another email to write: put above the call or the note that closes it (W6: the call step is always
 * last), else at its end; five steps at most. It starts with no words, so the box says it is still to write.
 */
export function reachOutInsertStep(reachOutDraft: ReachOutDraft): ReachOutDraft {
  if (reachOutDraft.steps.length >= REACH_OUT_STEPS_MAX) return reachOutDraft;
  const step: ReachOutDraftStep = {
    id: null,
    subject: null,
    body: "",
    after_days: REACH_OUT_AFTER_DAYS.first,
    hand: null,
  };
  const last = reachOutDraft.steps[reachOutDraft.steps.length - 1];
  if (last?.hand && reachOutDraft.steps.length > 1)
    return { ...reachOutDraft, steps: [...reachOutDraft.steps.slice(0, -1), step, last] };
  return { ...reachOutDraft, steps: [...reachOutDraft.steps, step] };
}

/** Whether another email may be added: five steps at most. */
export const reachOutMayInsertStep = (reachOutDraft: ReachOutDraft): boolean =>
  reachOutDraft.steps.length < REACH_OUT_STEPS_MAX;

/** The draft without the step at `i`: never the first, which is the sequence. */
export function reachOutRemoveStep(reachOutDraft: ReachOutDraft, index: number): ReachOutDraft {
  if (index <= 0 || index >= reachOutDraft.steps.length) return reachOutDraft;
  return { ...reachOutDraft, steps: reachOutDraft.steps.filter((_, j) => j !== index) };
}

/**
 * A step taken out, put back where it stood (its Undo): its words, wait and hand as they were, saved as a new step (the
 * one taken out is gone from the chain); five steps at most, and never before the first.
 */
export function reachOutPutBackStep(
  reachOutDraft: ReachOutDraft,
  index: number,
  step: ReachOutDraftStep,
): ReachOutDraft {
  if (reachOutDraft.steps.length >= REACH_OUT_STEPS_MAX || index <= 0) return reachOutDraft;
  const at = Math.min(index, reachOutDraft.steps.length);
  return {
    ...reachOutDraft,
    steps: [...reachOutDraft.steps.slice(0, at), { ...step, id: null }, ...reachOutDraft.steps.slice(at)],
  };
}

/** The dock of a draft whose email is still to write: the step it asks for, then Start. Null where every one is written. */
export function leadDraftDockOf(
  row: { state: string },
  chain: Pick<ReachOutChainDto, "steps"> | null | undefined,
): { place: number; line: string; fact: string; act: string } | null {
  if (row.state !== "draft" || !chain) return null;
  const place = leadFirstUnwritten([...chain.steps].sort((a, b) => a.n - b.n));
  if (place === null) return null;
  const words = LEAD_BUILD_WORDS;
  return { place, line: words.unwritten(place), fact: words.thenStart, act: words.write(place) };
}

/**
 * Where a sequence to leads starts, in its parts: who joins (each lead added to it, or the search's ready ones too, where
 * it adds them on its own), the search's name where there is one, and the line under: how many are in it and the day's
 * pace. The sequence's own name is its head's, never said again here (3 Nov 2026: the head, its sub-line and this row
 * said it three times).
 */
export function leadStartOf(
  row: { name: string; in_it: number; first: { source_name?: string | null; search_name: string | null } | null },
  chain: Pick<ReachOutChainDto, "mailboxes" | "owner_sends" | "gap_minutes"> | null | undefined,
): { lead: string; name: string | null; sub: string } {
  const words = LEAD_BUILD_WORDS;
  const source = row.first?.source_name ?? null;
  const pace = chain ? chainPaceOf(chain) : null;
  const sends = !chain
    ? null
    : chain.owner_sends || (pace && pace.share > 0)
      ? words.pace(pace?.share ?? REACH_OUT_DRAFTS_PER_DAY, chain.owner_sends === true)
      : words.noMailbox;
  return {
    lead: source ? words.startFound : words.startAdd,
    name: source,
    sub: [words.inIt(row.in_it), sends].filter(Boolean).join(" · "),
  };
}

/** One slot the Insert list offers: its label, and what it holds for the lead previewed. */
export interface LeadInsertRowVM {
  key: ReachOutSlot;
  label: string;
  /** What it says for them, or what stands in its place: "when found", "written for each", "not set". */
  value: string;
  look: "value" | "later" | "unset";
  group: "them" | "you";
}

/** The slots about them, in the list's order; a company's person slots only where the lead previewed is a company. */
const THEM: readonly ReachOutSlot[] = ["business", "city", "first name", "opening"];

const COMPANY: readonly ReachOutSlot[] = ["company", "title", "role"];

export const YOU: readonly ReachOutSlot[] = ["your name", "your business", "booking link"];

/**
 * The Insert list (the canvas's step sheet): each slot under About them and About you, with the value the send's own fill
 * gives it for the lead previewed (reachOutCardSlotsOf), or what stands in for it: a person's first name is found per lead,
 * the opening is written for each, and a value of yours with nothing in Settings is not set, which holds every email that
 * names it. Their preview (decision 0079) is offered where it can go (leadPreviewOfferOf), made when it goes.
 */
export function leadInsertRowsOf(
  lead: SlotLead | null,
  workspace: SlotWorkspace,
  preview: { offered: boolean },
): LeadInsertRowVM[] {
  const words = LEAD_BUILD_WORDS;
  const them = lead?.kind === "company" ? [...THEM.slice(0, 3), ...COMPANY, "opening" as const] : THEM;
  const keys: ReachOutSlot[] = [...them, ...(preview.offered ? (["their preview"] as const) : []), ...YOU];
  const filled = lead
    ? new Map(
        reachOutCardSlotsOf(
          keys.map((k) => `{{${k}}}`),
          lead,
          workspace,
        ).map((s) => [s.key, s]),
      )
    : null;
  return keys.map((key): LeadInsertRowVM => {
    const group = YOU.includes(key) ? "you" : "them";
    const label = leadSlotLabel(key);
    if (key === "opening") return { key, label, value: words.writtenForEach, look: "later", group };
    if (key === "their preview") return { key, label, value: words.previewMade, look: "later", group };
    const result = filled?.get(key);
    if (group === "you") {
      const value =
        key === "your name"
          ? workspace.yourName
          : key === "your business"
            ? workspace.businessName
            : workspace.bookingLink;
      return value?.trim()
        ? { key, label, value: value.trim(), look: "value", group }
        : { key, label, value: words.notSet, look: "unset", group };
    }
    if (!result || result.value === null || result.fellBack)
      return { key, label, value: words.whenFound, look: "later", group };
    return { key, label, value: result.value, look: "value", group };
  });
}

/**
 * Whether a step offers {{their preview}}, or why not (decision 0079): a workspace that makes none is told nothing; a
 * first email carries no link; a company (an agency search's leads) takes no bookings.
 */
export function leadPreviewOfferOf(params: { makes: boolean; first: boolean; lead: SlotLead | null }): {
  offered: boolean;
  why: string | null;
} {
  if (!params.makes) return { offered: false, why: null };
  if (params.first) return { offered: false, why: LEAD_BUILD_WORDS.previewLater };
  if (params.lead?.kind === "company") return { offered: false, why: LEAD_BUILD_WORDS.previewNotForCompanies };
  return { offered: true, why: null };
}
