/**
 * The reach-out sheet's draft (Reach out, Part 4 PR 6): what the sheet holds while a chain is written or changed, the
 * body it saves (ReachOutChainSchema's shape), its problems at the field they belong to (validateReachOutChain, in
 * chainIssueWords), a slot put in at the caret, the pace its mailboxes allow, the preview's lines, and the Leads door.
 * Pure: the page draws these and says every sentence from here.
 */
import { mailboxDailyCap, mailboxRampShare, MAILBOX_RAMP } from "../email/mailbox-connections";
import {
  REACH_OUT_PREVIEW_INDEX_MAX,
  type ReachOutChainDto,
  type ReachOutPreviewDto,
  type ReachOutReachDto,
  type ReachOutSavedDto,
} from "./reach-out-dtos";
import type { HandKind, StepHand } from "./reach-out-hand";
import { REACH_OUT_SHEET_WORDS, startWords } from "./reach-out-sheet";
import {
  REACH_OUT_AFTER_DAYS,
  REACH_OUT_MAILBOXES_MAX,
  REACH_OUT_STEPS_MAX,
  chainIssueWords,
  holdWords,
  isReachOutHold,
  validateReachOutChain,
  type ChainIssue,
} from "./reach-out-words";
import type { ReachOutChainInput } from "./reach-out-schemas";

export interface ReachOutDraftStep {
  /** The step's row when the chain is being changed; null for a step not saved yet. */
  id: string | null;
  subject: string | null;
  body: string;
  after_days: number | null;
  /** A call or a note for you instead of an email (Part 5, G20): the chain's last step only; null for an email. */
  hand: StepHand | null;
}

export interface ReachOutDraft {
  name: string;
  include_unconfirmed: boolean;
  gap_minutes: number;
  /** Empty: every connected mailbox of the workspace (00424). */
  mailbox_ids: string[];
  /** Its owner sends its emails from their own inbox, each handed to them as a draft (00429). */
  owner_sends: boolean;
  signed_by: string;
  steps: ReachOutDraftStep[];
}

/** The words a new chain starts from: a first email and, once added, a short nudge. The owner's to change. */
export const REACH_OUT_FIRST_WORDS = {
  subject: "A quick one for {{business}}",
  body: "{{opening}}\n\nI run {{your business}}, and we help businesses like yours. Would it be worth a short call?\n\n{{your name}}",
  nudge: "Just checking this reached you. Happy to send a few details if it's useful.\n\n{{your name}}",
} as const;

/**
 * The pace a new chain starts at: one email every twenty minutes or so from each mailbox (the lead workbench's call 10,
 * the mailbox review's pace for a cold mailbox).
 */
export const REACH_OUT_GAP_FIRST = 20;

/** A chain's name when it is given none: the search it writes to. */
export function reachOutDefaultName(searchName: string): string {
  return `Reach out · ${searchName}`.slice(0, 80);
}

/**
 * The draft a sheet opens as: the chain being changed, or a new one over the search, signed with the member's name. A new
 * one is its owner's to send (`ownerSends`) when the workspace has no mailbox connected to write from.
 */
export function reachOutDraftOf(p: {
  chain: ReachOutChainDto | null;
  searchName: string;
  signedBy: string | null;
  includeUnconfirmed?: boolean;
  ownerSends?: boolean;
}): ReachOutDraft {
  const c = p.chain;
  if (c)
    return {
      name: c.name,
      include_unconfirmed: c.include_unconfirmed,
      gap_minutes: c.gap_minutes,
      mailbox_ids: c.mailbox_ids,
      owner_sends: c.owner_sends === true,
      signed_by: c.signed_by ?? p.signedBy ?? "",
      steps: c.steps.map((s) => ({
        id: s.id,
        subject: s.n === 0 ? s.subject : null,
        body: s.body,
        after_days: s.n === 0 ? null : s.after_days,
        hand: s.hand,
      })),
    };
  return {
    name: reachOutDefaultName(p.searchName),
    include_unconfirmed: !!p.includeUnconfirmed,
    gap_minutes: REACH_OUT_GAP_FIRST,
    mailbox_ids: [],
    owner_sends: p.ownerSends === true,
    signed_by: p.signedBy ?? "",
    steps: [
      {
        id: null,
        subject: REACH_OUT_FIRST_WORDS.subject,
        body: REACH_OUT_FIRST_WORDS.body,
        after_days: null,
        hand: null,
      },
    ],
  };
}

/**
 * A version of a sequence to leads (the lead sheet's Make a version, 17 Oct 2026): its steps, waits, pace, mailboxes and
 * signature as they are, each step new (nothing of the one it copies is changed), under its own name, for the owner to
 * change what is different for these leads. Its list is its own, made as it starts, so it is never a twin.
 */
export function reachOutVersionDraftOf(chain: ReachOutChainDto, name: string, signedBy: string | null): ReachOutDraft {
  const d = reachOutDraftOf({ chain, searchName: chain.name, signedBy });
  return { ...d, name, steps: d.steps.map((s) => ({ ...s, id: null })) };
}

/** The composer on a list of its own (a new sequence for a lead, or a version): who gets it before the list exists. */
export const REACH_OUT_NEW_LIST_WORDS = {
  title: "A list of its own",
  goesOn: (lead: string) => `${lead} goes on it when you start`,
  version: (name: string) => `A version of “${name}”: the same steps, waits and mailboxes. Change what's different.`,
  /** A version's name until the owner names it. */
  nameOf: (sequence: string, lead: string) => `${sequence}, for ${lead}`,
  /** A new sequence's name for a lead, until the owner names it. */
  forLead: (lead: string) => `For ${lead}`,
  before: "Each lead's first email is written for them as their batch is planned; you see it before it goes.",
  /** Back on the lead, once it started: the name it was given may not be the one it opened with, so the lead's is said. */
  started: (lead: string) => `Started: ${lead} is on its own list`,
  startedOn: (list: string) => `Started on “${list}”`,
  someone: "this lead",
} as const;

/**
 * Whether another step may be added (five at most, and nothing after a call or a note, which ends the chain), and the
 * draft with one: a short nudge four days on.
 */
export function reachOutMayAddStep(d: ReachOutDraft): boolean {
  return d.steps.length < REACH_OUT_STEPS_MAX && !d.steps[d.steps.length - 1]?.hand;
}
export function reachOutAddStep(d: ReachOutDraft): ReachOutDraft {
  if (!reachOutMayAddStep(d)) return d;
  const step = {
    id: null,
    subject: null,
    body: REACH_OUT_FIRST_WORDS.nudge,
    after_days: REACH_OUT_AFTER_DAYS.first,
    hand: null,
  };
  return { ...d, steps: [...d.steps, step] };
}
/** The draft ending in a call or a note for you (Part 5, G20): as another step may be added, after the first email. */
export function reachOutAddHandStep(d: ReachOutDraft, kind: HandKind): ReachOutDraft {
  if (!reachOutMayAddStep(d)) return d;
  const step = { id: null, subject: null, body: "", after_days: REACH_OUT_AFTER_DAYS.first, hand: { kind, words: "" } };
  return { ...d, steps: [...d.steps, step] };
}
/** A hand step's words, as the member writes them. */
export function reachOutSetHandWords(d: ReachOutDraft, i: number, words: string): ReachOutDraft {
  const s = d.steps[i];
  if (!s?.hand) return d;
  return { ...d, steps: d.steps.map((x, j) => (j === i ? { ...x, hand: { kind: s.hand!.kind, words } } : x)) };
}
/** The draft without its last step; the first email always stays. */
export function reachOutDropStep(d: ReachOutDraft): ReachOutDraft {
  return d.steps.length > 1 ? { ...d, steps: d.steps.slice(0, -1) } : d;
}

/** The days a later step may wait, as the sheet offers them. */
export function reachOutAfterDayChoices(): number[] {
  const out: number[] = [];
  for (let n = REACH_OUT_AFTER_DAYS.min; n <= REACH_OUT_AFTER_DAYS.max; n += 1) out.push(n);
  return out;
}

/** The body the sheet saves: ReachOutChainSchema's shape, each step's id kept where it has one (an edit). */
export function reachOutChainBodyOf(d: ReachOutDraft, searchId: string): ReachOutChainInput {
  return {
    name: d.name.trim() || "Reach out",
    search_id: searchId,
    include_unconfirmed: d.include_unconfirmed,
    gap_minutes: d.gap_minutes,
    mailbox_ids: d.mailbox_ids,
    owner_sends: d.owner_sends,
    signed_by: d.signed_by.trim() || null,
    // An email carries no hand at all: the door reads a step with the key as a hand step (00228).
    steps: d.steps.map((s, i) => ({
      ...(s.id ? { id: s.id } : {}),
      subject: i === 0 ? (s.subject ?? "") : null,
      body: s.hand ? "" : s.body,
      after_days: i === 0 ? null : s.after_days,
      ...(s.hand ? { hand: { kind: s.hand.kind, words: s.hand.words } } : {}),
    })),
  };
}

export interface ReachOutDraftIssues {
  /** Per step, per field, the sentences that field's problems are said in. */
  steps: Array<{ subject: string[]; body: string[]; after_days: string[] }>;
  /** The name to sign with, and a booking link the words name and the workspace lacks. */
  signed_by: string[];
  chain: string[];
  /** Nothing in the way: Start may be pressed. */
  ready: boolean;
}

/** The draft's problems at the field each belongs to, in contracts' words (validateReachOutChain, chainIssueWords). */
export function reachOutDraftIssues(d: ReachOutDraft, has: { bookingLink: boolean }): ReachOutDraftIssues {
  const issues: ChainIssue[] = validateReachOutChain(
    reachOutChainBodyOf(d, "00000000-0000-4000-8000-000000000000"),
    has,
  );
  const steps = d.steps.map(() => ({ subject: [] as string[], body: [] as string[], after_days: [] as string[] }));
  const out: ReachOutDraftIssues = { steps, signed_by: [], chain: [], ready: issues.length === 0 };
  for (const i of issues) {
    const words = chainIssueWords(i);
    if (i.step === null) (i.field === "signed_by" ? out.signed_by : out.chain).push(words);
    else if (i.field === "subject" || i.field === "body" || i.field === "after_days")
      steps[i.step][i.field].push(words);
  }
  return out;
}

/**
 * How many a day the chosen mailboxes write between them (the sheet's pace): each one's day (contracts mailboxDailyCap),
 * added up, since a run's new leads take turns across them; the fewest days any has sent, which says when the pace next
 * rises; and how many there are. None chosen is every connected one. Nothing to write from is a share of 0.
 */
export function reachOutSheetPaceOf(
  mailboxes: Array<{ id: string; state: string; sent_days: number; daily_cap: number; customer_domain: boolean }>,
  picked: string[],
): { share: number; sentDays: number; mailboxes: number; rises: number | null } {
  const from = mailboxes.filter((m) => m.state === "connected" && (picked.length === 0 || picked.includes(m.id)));
  if (from.length === 0) return { share: 0, sentDays: 0, mailboxes: 0, rises: null };
  const share = from.reduce((t, m) => t + mailboxDailyCap(m), 0);
  const sentDays = Math.min(...from.map((m) => m.sent_days));
  // The pace rises when the newest mailbox reaches its ramp's next step, unless its owner's cap stands below it.
  const next = MAILBOX_RAMP.find((s) => s.days > sentDays);
  const youngest = from.find((m) => m.sent_days === sentDays);
  const rises =
    next && youngest && mailboxDailyCap(youngest) >= mailboxRampShare(sentDays) ? next.days - sentDays : null;
  return { share, sentDays, mailboxes: from.length, rises };
}

/** Why the preview could not write this business's email, as the sender would hold or skip it. */
export function previewRefusedWords(reason: string): string {
  switch (reason) {
    case "no_booking_link":
      return "Your words name {{booking link}}, and your booking link isn't set.";
    case "no_signed_by":
      return "Your words name {{your name}}. Say the name you sign with.";
    case "no_subject":
      return "Your email needs a subject.";
    case "unknown_slot":
      return "Your words name a slot that isn't one of the six.";
    case "missing_value":
      // The send door skips that one email (edge request.ts: missing_value), never holds it: it would not wait.
      return "This business is missing a value your words name, so its email would be skipped.";
    case "no_business_address":
      return "Add your business's address in Settings › Details: every email carries it at the foot.";
    default:
      return "These words can't go as they are.";
  }
}

/** The preview's lines: whose email it is and where in the list, its hold or its refusal, or that it waits for words. */
export function previewLinesOf(p: { preview: ReachOutPreviewDto; index: number; of: number }) {
  const v = p.preview;
  return {
    reader: v.lead ? `as ${v.lead.business_name} reads it · ${p.index + 1} of ${p.of}` : null,
    nobody: v.lead ? null : "Nobody on this search can be written to yet.",
    hold: v.hold && isReachOutHold(v.hold) ? `The check would hold this one: ${holdWords(v.hold, v.detail)}.` : null,
    refused: v.refused ? previewRefusedWords(v.refused) : null,
    unavailable: v.unavailable ? "The opening couldn't be written just now. Rewrite the opening to ask again." : null,
    first: p.index <= 0,
    last: p.index + 1 >= p.of,
  };
}

/** How many businesses the preview pages through: the search's reach, as far as a preview may go (a run's cap, F11). */
export function reachOutPreviewOf(reach: number): number {
  return Math.max(1, Math.min(reach, REACH_OUT_PREVIEW_INDEX_MAX + 1));
}

/** The preview's own words. */
export const REACH_OUT_PREVIEW_WORDS = {
  read: "Read it as they will",
  prev: "Previous",
  next: "Next",
  rewrite: "Rewrite the opening",
  reading: "Writing this business's opening…",
  changed: "Your words changed · Read it again",
} as const;

/**
 * The Leads door on a search (F10, R19's order): the search's chain when it has one; else its ready businesses; else
 * the ones whose address is unconfirmed, included; else nothing. One chain per search.
 */
export function reachOutDoorOf(
  r: ReachOutReachDto | null,
): { kind: "open"; label: string; rootId: string } | { kind: "write"; label: string; include: boolean } | null {
  if (!r) return null;
  if (r.chain) return { kind: "open", label: "Open its reach-out", rootId: r.chain };
  if (r.ready > 0) return { kind: "write", label: `Write to the ${r.ready} ready`, include: false };
  const unconfirmed = Math.max(0, r.with_unconfirmed - r.ready);
  if (unconfirmed > 0) return { kind: "write", label: `Write to the ${unconfirmed} unconfirmed`, include: true };
  return null;
}

/** Who the chain writes to, as the unconfirmed addresses are held or included (R22). */
export function reachOutWhoWords(includeUnconfirmed: boolean): string {
  return includeUnconfirmed
    ? "Ready, and those whose address is unconfirmed, never written to. Keeps itself current as the search grows."
    : REACH_OUT_SHEET_WORDS.who;
}

/** Whether another mailbox may be picked (ReachOutChainSchema's most). */
export function reachOutMayPickMailbox(d: ReachOutDraft): boolean {
  return d.mailbox_ids.length < REACH_OUT_MAILBOXES_MAX;
}

/** A read the sheet draws from: in, still out, or failed. */
type ReachOutSheetRead = "in" | "reading" | "failed";

/**
 * What the sheet cannot say yet because a read it draws from is not in: the mailboxes (Setup's read) and the booking
 * link (Settings' read). Unread is never "none": the sheet says it is reading, and Start waits.
 */
export function reachOutSheetUnreadOf(r: { mailboxes: ReachOutSheetRead; settings: ReachOutSheetRead }): string | null {
  if (r.mailboxes === "failed" || r.settings === "failed")
    return "Your mailboxes or your booking link couldn't be read. Start waits until they are; reload to try again.";
  if (r.mailboxes === "reading" || r.settings === "reading") return "Reading your mailboxes and your booking link…";
  return null;
}

/**
 * What an edit of a chain's words did, once saved: new words send what waits for their step back to the check (R5). The
 * sheet says it after its save, and Templates after a reach-out's email is written there.
 */
export function reachOutEditedWords(rechecked: number): string {
  return rechecked > 0
    ? `Saved. ${rechecked === 1 ? "1 email waiting to go is" : `${rechecked} emails waiting to go are`} checked again against these words.`
    : "Saved. Its next run writes these words.";
}

/**
 * What a save did, said in the sheet itself once it is saved (R14): the first run's outcome in startWords, or an
 * edit's, and the one door on from there: the run that waits, else the chain's Playbooks row. The sheet stays open to
 * say it, so the words are never lost to a page change.
 */
export function reachOutSavedWords(saved: ReachOutSavedDto): {
  tone: "good" | "warn" | "plain";
  text: string;
  to: string;
  label: string;
} {
  const said = saved.start
    ? startWords(saved.start)
    : { tone: "good" as const, text: reachOutEditedWords(saved.rechecked) };
  const run = saved.start ? saved.start.run_id : null;
  return run
    ? { ...said, to: `broadcasts/run:${run}`, label: "Open the run" }
    : { ...said, to: `outbound/${saved.root_id}`, label: "Open its reach-out" };
}

/** The sheet's own labels: its parts, its fields and its acts. */
export const REACH_OUT_SHEET_PARTS = {
  who: "Who gets it",
  words: "What you'd say",
  then: "Then",
  pace: "Pace",
  from: "From",
  before: "Before it goes",
  subject: "Subject",
  body: "Your words",
  signAs: "Sign as",
  after: "After",
  afterTail: "with nothing back · in the same thread",
  dayOne: "Day one · the pace below",
  remove: "Remove this step",
  everyMailbox: "Every connected mailbox",
  /** From's choice for a reach-out its owner sends (00429). */
  youSend: "You send them, from your own inbox",
  mailboxesMax: `Up to ${REACH_OUT_MAILBOXES_MAX} mailboxes, or every connected one.`,
  connectGoogle: "Connect Google",
  connectMicrosoft: "Connect Microsoft",
  close: "Close",
  recommended: "Recommended",
  start: "Start it",
  save: "Save",
  starting: "Starting…",
  saving: "Saving…",
  cancel: "Cancel",
  name: "The reach-out's name",
  fromLine: "From",
  toLine: "To",
  subjectLine: "Subject",
  footLine: "At the foot",
  repliesLine: "Replies",
} as const;
