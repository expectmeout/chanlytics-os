/**
 * A sequence to leads written on its own record (the lead-to-sequence canvas's Build boards A to D, 18 Oct 2026): the draft
 * is the record, with the same tabs as any sequence. Its Start row (who joins it, how many are in it, the day's pace), each
 * step's box (the subject's words with their slots by name, two lines of the email, or "Not written yet"), the call that
 * always closes it, the dock that asks for the step still to write before Start, a step's sheet (subject, email, Insert
 * with each value as it stands for the lead previewed, Ask rewrites it, Preview as a real lead, Send me a test) and How it
 * runs (who joins, how it sends), one sheet saved as it changes. Pure: the page draws these, and says every sentence
 * from here.
 */
import {
  LEAD_CARD_WORDS,
  leadCardStepsOf,
  type LeadCardChain,
  type LeadCardEmailVM,
  type LeadCardLead,
} from "../leads/lead-card";
import type { ReachOutChainDto, ReachOutMailboxChoice, ReachOutMailboxFacts } from "../reach-out/reach-out-dtos";
import { CUSTOMER_DOMAIN_DAILY_MAX, MAILBOX_DAILY_CAP_MAX, mailboxDailyCap } from "../email/mailbox-standing";
import { reachOutWritesFrom } from "../email/mailbox-connections";
import { chainFirstSender, type ReachOutDraft, type ReachOutDraftStep } from "../reach-out/reach-out-draft";
import {
  REACH_OUT_DRAFTS_PER_DAY,
  reachOutCardSlotsOf,
  type SlotLead,
  type SlotWorkspace,
} from "../reach-out/reach-out-rules";
import { chainPaceOf } from "../reach-out/reach-out-sheet";
import {
  REACH_OUT_AFTER_DAYS,
  REACH_OUT_GAP_MINUTES,
  REACH_OUT_SLOT_SET,
  REACH_OUT_STEPS_MAX,
  type ReachOutSlot,
} from "../reach-out/reach-out-words";
import { plural } from "../shared/words";
import { slotMentions } from "../templates/slot-sets";
import { SEQUENCE_MODE_LABEL } from "./sequence";
import { SCHEDULE_WORDS } from "./sequence-schedule";

/** The record's words for a sequence to leads, said once. */
export const LEAD_BUILD_WORDS = {
  /** The Start row: who joins, then the line under it. */
  startAdd: "When you add a lead to ",
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
  askPrompt: (place: number, name: string) => `Rewrite step ${place} of “${name}”: `,
  preview: "Preview",
  holdsOne: "A value that can’t be filled holds that one email for you.",
  aboutThem: "About them",
  aboutYou: "About you",
  whenFound: "when found",
  writtenForEach: "written for each",
  /** {{their preview}} (decision 0079): made at the first email that names it. */
  previewMade: "made when it goes",
  /** Why a step offers no {{their preview}}: a first email carries no link, and a company takes no bookings. */
  previewLater: "Their preview goes in a later email: a first email carries no link.",
  previewNotForCompanies: "Their preview is for a business that takes bookings, so a company gets none.",
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
  /** Preview as a real lead. */
  previewSub: (place: number) => `Step ${place}, as each lead gets it`,
  previewOf: (name: string, at: number, of: number) => `${name} · ${at} of ${of}`,
  yourInbox: "your inbox",
  prev: "Previous lead",
  next: "Next lead",
  example: "An example business: nobody is in it yet",
  testLine: (place: number, name: string) => `Step ${place}, as ${name} gets it`,
  testFact: "To your own inbox, marked as a test",
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
    noneSends: "No mailbox sends now, so nothing goes: choose Your inbox to send each yourself, or connect one.",
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
    /** The batch rule as it stands (0077, D11): every batch of first emails of a sequence fed by a list waits for an OK. */
    firstEmails: "Every batch of first emails waits for your OK",
    /** The mode's choice, for the steps after the first. */
    followUps: "Follow-ups",
    followUpModes: { veto: "Your OK first, then 30 minutes to stop", ask: "Each waits for your OK" } satisfies Record<
      "veto" | "ask",
      string
    >,
    /** The mailboxes it writes from (0077, D4): a tick each, one always kept. */
    everyMailbox: "Every mailbox, and any you connect later",
    keepOne: "One has to send. To stop them all, choose Your inbox · you send.",
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
    signatureHasLink: "First emails leave out its link.",
    noName: "Write the name it ends with.",
  },
} as const;

/** A step's words cut into words and slots by name: a box's title and its lines, as the editor's chips name them. */
export type LeadBuildPart = { kind: "text"; text: string } | { kind: "slot"; key: string; label: string };

/** The editor's name for a slot ("Their business"), by its key. */
const leadSlotLabel = (key: string): string => REACH_OUT_SLOT_SET.labels[REACH_OUT_SLOT_SET.keys.indexOf(key)] ?? key;

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
  for (const s of [...chain.steps].sort((a, b) => a.n - b.n)) {
    const hand = s.hand?.kind ?? null;
    const unwritten = leadStepUnwritten(s);
    const subject = s.n === 0 && s.subject?.trim() ? leadBuildPartsOf(s.subject) : null;
    const title: LeadBuildPart[] = subject ?? [
      {
        kind: "text",
        text:
          hand === "call"
            ? LEAD_BUILD_WORDS.call
            : hand === "note"
              ? LEAD_BUILD_WORDS.note
              : s.n === 0
                ? LEAD_BUILD_WORDS.firstEmail
                : LEAD_BUILD_WORDS.followUp,
      },
    ];
    out.set(s.id, {
      place: s.n + 1,
      title,
      named: partsWords(title),
      pre: hand || unwritten ? null : leadBuildPartsOf(s.body.replace(/\s*\n+\s*/g, " ").trim()),
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
export function reachOutInsertStep(d: ReachOutDraft): ReachOutDraft {
  if (d.steps.length >= REACH_OUT_STEPS_MAX) return d;
  const step: ReachOutDraftStep = {
    id: null,
    subject: null,
    body: "",
    after_days: REACH_OUT_AFTER_DAYS.first,
    hand: null,
  };
  const last = d.steps[d.steps.length - 1];
  if (last?.hand && d.steps.length > 1) return { ...d, steps: [...d.steps.slice(0, -1), step, last] };
  return { ...d, steps: [...d.steps, step] };
}

/** Whether another email may be added: five steps at most. */
export const reachOutMayInsertStep = (d: ReachOutDraft): boolean => d.steps.length < REACH_OUT_STEPS_MAX;

/** The draft without the step at `i`: never the first, which is the sequence. */
export function reachOutRemoveStep(d: ReachOutDraft, i: number): ReachOutDraft {
  if (i <= 0 || i >= d.steps.length) return d;
  return { ...d, steps: d.steps.filter((_, j) => j !== i) };
}

/**
 * A step taken out, put back where it stood (its Undo): its words, wait and hand as they were, saved as a new step (the
 * one taken out is gone from the chain); five steps at most, and never before the first.
 */
export function reachOutPutBackStep(d: ReachOutDraft, i: number, step: ReachOutDraftStep): ReachOutDraft {
  if (d.steps.length >= REACH_OUT_STEPS_MAX || i <= 0) return d;
  const at = Math.min(i, d.steps.length);
  return { ...d, steps: [...d.steps.slice(0, at), { ...step, id: null }, ...d.steps.slice(at)] };
}

/** The dock of a draft whose email is still to write: the step it asks for, then Start. Null where every one is written. */
export function leadDraftDockOf(
  row: { state: string },
  chain: Pick<ReachOutChainDto, "steps"> | null | undefined,
): { place: number; line: string; fact: string; act: string } | null {
  if (row.state !== "draft" || !chain) return null;
  const place = leadFirstUnwritten([...chain.steps].sort((a, b) => a.n - b.n));
  if (place === null) return null;
  const W = LEAD_BUILD_WORDS;
  return { place, line: W.unwritten(place), fact: W.thenStart, act: W.write(place) };
}

/**
 * Where a sequence to leads starts, in its parts: who joins (each lead added to it, or the search's ready ones too, where
 * it adds them on its own), its name, and the line under: how many are in it and the day's pace.
 */
export function leadStartOf(
  row: { name: string; in_it: number; first: { source_name?: string | null; search_name: string | null } | null },
  chain: Pick<ReachOutChainDto, "mailboxes" | "owner_sends" | "gap_minutes"> | null | undefined,
): { lead: string; name: string; sub: string } {
  const W = LEAD_BUILD_WORDS;
  const source = row.first?.source_name ?? null;
  const pace = chain ? chainPaceOf(chain) : null;
  const sends = !chain
    ? null
    : chain.owner_sends || (pace && pace.share > 0)
      ? W.pace(pace?.share ?? REACH_OUT_DRAFTS_PER_DAY, chain.owner_sends === true)
      : W.noMailbox;
  return {
    lead: source ? W.startFound : W.startAdd,
    name: source ?? row.name,
    sub: [W.inIt(row.in_it), sends].filter(Boolean).join(" · "),
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
const YOU: readonly ReachOutSlot[] = ["your name", "your business", "booking link"];

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
  const W = LEAD_BUILD_WORDS;
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
    if (key === "opening") return { key, label, value: W.writtenForEach, look: "later", group };
    if (key === "their preview") return { key, label, value: W.previewMade, look: "later", group };
    const s = filled?.get(key);
    if (group === "you") {
      const value =
        key === "your name"
          ? workspace.yourName
          : key === "your business"
            ? workspace.businessName
            : workspace.bookingLink;
      return value?.trim()
        ? { key, label, value: value.trim(), look: "value", group }
        : { key, label, value: W.notSet, look: "unset", group };
    }
    if (!s || s.value === null || s.fellBack) return { key, label, value: W.whenFound, look: "later", group };
    return { key, label, value: s.value, look: "value", group };
  });
}

/**
 * Whether a step offers {{their preview}}, or why not (decision 0079): a workspace that makes none is told nothing; a
 * first email carries no link; a company (an agency search's leads) takes no bookings.
 */
export function leadPreviewOfferOf(p: { makes: boolean; first: boolean; lead: SlotLead | null }): {
  offered: boolean;
  why: string | null;
} {
  if (!p.makes) return { offered: false, why: null };
  if (p.first) return { offered: false, why: LEAD_BUILD_WORDS.previewLater };
  if (p.lead?.kind === "company") return { offered: false, why: LEAD_BUILD_WORDS.previewNotForCompanies };
  return { offered: true, why: null };
}

/** One pace the day's row offers: the most a day it comes to across its mailboxes, and how often each writes. */
export interface LeadPaceChoice {
  gap: number;
  share: number;
  hint: string;
}

/**
 * How it runs' "A day, at most": each gap the database allows, as the day it comes to across the chain's mailboxes
 * (chainPaceOf, the timetable's own count), one entry per day, each the slowest gap that reaches it, so the day's emails
 * are spread as far as that day allows (0077: the fastest was kept, and a new mailbox offered one every 5 minutes). The
 * saved gap is a choice of its own where it is none of these, so the picker always says what is saved. Largest day first,
 * then the slower gap. An owner's own inbox has none: they send each, so the day is theirs.
 */
export function leadPaceChoicesOf(mailboxes: readonly ReachOutMailboxFacts[], saved?: number): LeadPaceChoice[] {
  const shareAt = (gap: number) =>
    chainPaceOf({ mailboxes: [...mailboxes], owner_sends: false, gap_minutes: gap }).share;
  const slowest = new Map<number, number>();
  for (const gap of REACH_OUT_GAP_MINUTES) {
    const share = shareAt(gap);
    if (share > 0) slowest.set(share, gap);
  }
  const gaps = new Set(slowest.values());
  if (saved !== undefined && (REACH_OUT_GAP_MINUTES as readonly number[]).includes(saved) && shareAt(saved) > 0)
    gaps.add(saved);
  return [...gaps]
    .map((gap) => ({ gap, share: shareAt(gap), hint: LEAD_BUILD_WORDS.runs.every(gap) }))
    .sort((a, b) => b.share - a.share || b.gap - a.gap);
}

/**
 * The chain as its record holds it while it is written (the draft beside the chain it was read from): its steps as the
 * draft has them, numbered in order, and the name it signs with, so a preview reads the words being typed.
 */
export function leadDraftChainOf<C extends Pick<ReachOutChainDto, "steps" | "signed_by">>(
  chain: C,
  d: ReachOutDraft,
): C {
  return {
    ...chain,
    signed_by: d.signed_by.trim() || null,
    steps: d.steps.map((s, n) => ({
      id: s.id ?? `new-${n}`,
      n,
      after_days: n === 0 ? null : s.after_days,
      subject: n === 0 ? s.subject : null,
      body: s.hand ? "" : s.body,
      template_id: null,
      hand: s.hand,
      state: "running" as const,
    })),
  };
}

/**
 * One step's email as one lead gets it (the canvas's Preview as a real lead): its words filled by the send's own fill
 * (leadCardStepsOf), under the first email's subject where it answers in that thread, and what holds it where a value
 * they lack stands in its words. Null for a call or a note, and a place the chain does not have.
 */
export function leadPreviewEmailOf(p: {
  chain: LeadCardChain;
  lead: LeadCardLead;
  workspace: SlotWorkspace;
  place: number;
}): LeadCardEmailVM | null {
  const steps = leadCardStepsOf(p);
  const step = steps[p.place - 1];
  const at = [...p.chain.steps].sort((a, b) => a.n - b.n)[p.place - 1];
  if (!step || !at || at.hand) return null;
  const first = steps[0]?.subject ?? null;
  const subject = step.subject ?? (first ? [{ kind: "text" as const, text: "Re: " }, ...first] : null);
  const gaps = [
    ...new Set([...(step.subject ?? []), ...step.body].flatMap((x) => (x.kind === "gap" ? [x.label] : []))),
  ];
  // A value of yours (lower-cased by the card) not set holds every email; one of theirs, this lead's alone.
  const yours = new Set(YOU.map((k) => leadSlotLabel(k).toLowerCase()));
  const mine = gaps.filter((g) => yours.has(g));
  const theirs = gaps.filter((g) => !yours.has(g));
  const W = LEAD_BUILD_WORDS;
  const blocked = [
    mine.length ? W.youUnset(mine.map((g) => g.charAt(0).toUpperCase() + g.slice(1))) : null,
    theirs.length ? W.theyLack(theirs) : null,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    head: LEAD_CARD_WORDS.emailOf(p.place, steps.length),
    to: p.lead.to,
    subject,
    body: step.body,
    when: null,
    note: null,
    blocked: blocked || null,
    instead: null,
  };
}

/**
 * The email with its opening said, where the listing's own fields say one (contracts leadFactOf, decision 0078): the
 * check writes the same sentence when the batch is planned, so the preview reads as the send will. The email as it was
 * where it has no opening, or there is none to say.
 */
export function withOpeningSaid(email: LeadCardEmailVM, opening: string | null): LeadCardEmailVM {
  if (!opening) return email;
  return { ...email, body: email.body.map((p) => (p.kind === "opening" ? { kind: "opening", text: opening } : p)) };
}

/* ---------------------------------------------------------------------------------- Sending, its mailboxes (0077) */

/** One mailbox's row in How it runs: its tick, whether it may be taken off, and the line under its address. */
export interface LeadMailboxRowVM {
  id: string;
  address: string;
  on: boolean;
  /** The last one ticked: it stays, since a sequence that names none writes from every mailbox (00424). */
  locked: boolean;
  sub: string;
  /** Its SPF or DKIM is missing: the row offers Set up DNS. */
  dnsMissing: boolean;
}

const pickedIn = (c: Pick<ReachOutMailboxChoice, "id" | "state">, picked: readonly string[]) =>
  reachOutWritesFrom({ id: c.id, state: c.state }, picked);

/** Why a mailbox sends nothing now, in a word: its state, or its day done; null while it sends. */
function notSendingOf(c: Pick<ReachOutMailboxChoice, "state" | "sends_now">): string | null {
  const N = LEAD_BUILD_WORDS.runs.notSending;
  if (c.sends_now) return null;
  if (c.state === "paused" || c.state === "held" || c.state === "reconnect") return N[c.state];
  return c.state === "connected" ? N.resting : null;
}

/**
 * How it runs' mailbox rows (0077, D4), for the ids the draft names: each with its tick, "New" first for one connected
 * after the sequence was made, its day (a ramping mailbox's rising to its top: 40, or 20 on the domain its customers
 * write to), why it does not send now where it does not, the DNS records it is missing, and the last tick kept.
 */
export function leadMailboxRowsOf(
  chain: Pick<ReachOutChainDto, "mailbox_choices" | "created_at">,
  picked: readonly string[],
): LeadMailboxRowVM[] {
  const R = LEAD_BUILD_WORDS.runs;
  const choices = chain.mailbox_choices ?? [];
  const count = choices.filter((c) => pickedIn(c, picked)).length;
  return choices.map((c) => {
    const on = pickedIn(c, picked);
    const top = Math.min(
      c.facts.daily_cap,
      c.facts.customer_domain ? CUSTOMER_DOMAIN_DAILY_MAX : MAILBOX_DAILY_CAP_MAX,
    );
    const missing = (["spf", "dkim"] as const).filter((k) => c.dns[k] === "missing");
    const resting = notSendingOf(c);
    const sub = [
      c.connected_at > chain.created_at ? R.newMailbox : null,
      R.day(mailboxDailyCap(c.facts), top),
      resting,
      missing.length ? R.dnsMissing(missing) : null,
      on && count === 1 ? R.keepOne : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return { id: c.id, address: c.address, on, locked: on && count === 1, sub, dnsMissing: missing.length > 0 };
  });
}

/**
 * The ids a draft names after one tick: a list of its own from then on (a sequence that named none wrote from every
 * mailbox, which a tick makes the ones ticked), and never none, which would mean every one again.
 */
export function leadMailboxesTicked(
  chain: Pick<ReachOutChainDto, "mailbox_choices">,
  picked: readonly string[],
  id: string,
  on: boolean,
): string[] {
  const now = (chain.mailbox_choices ?? []).filter((c) => pickedIn(c, picked)).map((c) => c.id);
  const next = on ? [...new Set([...now, id])] : now.filter((x) => x !== id);
  return next.length > 0 ? next : now;
}

/** The mailboxes the draft writes from that send now: what its day is made of while it is being changed. */
export function leadSendingFactsOf(
  chain: Pick<ReachOutChainDto, "mailbox_choices" | "mailboxes">,
  picked: readonly string[],
): ReachOutMailboxFacts[] {
  if (!chain.mailbox_choices) return chain.mailboxes;
  return chain.mailbox_choices.filter((c) => c.sends_now && pickedIn(c, picked)).map((c) => c.facts);
}

/** Ends with (0077, D10): the name, or the signature of the first mailbox the draft writes from, and what to say. */
export function leadEndingOf(
  chain: Pick<ReachOutChainDto, "mailbox_choices">,
  d: Pick<ReachOutDraft, "mailbox_ids" | "signs_with" | "signed_by" | "owner_sends">,
): { value: "name" | "mailbox"; options: Array<{ value: "name" | "mailbox"; label: string }>; note: string | null } {
  const R = LEAD_BUILD_WORDS.runs;
  const first = d.owner_sends ? null : chainFirstSender(chain, d.mailbox_ids);
  const signature = first?.signature ?? null;
  const value = d.signs_with === "mailbox" && signature ? "mailbox" : "name";
  const options: Array<{ value: "name" | "mailbox"; label: string }> = [
    { value: "name", label: R.endsName(d.signed_by) },
  ];
  if (first && signature) options.push({ value: "mailbox", label: R.endsSignature(first.address) });
  const note =
    value === "mailbox" && signature?.has_link
      ? R.signatureHasLink
      : value === "name" && !d.signed_by.trim()
        ? R.noName
        : null;
  return { value, options, note };
}
