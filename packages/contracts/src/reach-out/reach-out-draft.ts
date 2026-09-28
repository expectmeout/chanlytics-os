/**
 * The reach-out sheet's draft (Reach out, Part 4 PR 6): what the sheet holds while a chain is written or changed, the
 * body it saves (ReachOutChainSchema's shape), its problems at the field they belong to (validateReachOutChain, in
 * chainIssueWords), a slot put in at the caret, the pace its domains allow, the preview's lines, and the Leads door.
 * Pure: the page draws these and says every sentence from here.
 */
import { domainDailyCap } from "../email/sending-domains";
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
  REACH_OUT_DOMAINS_MAX,
  REACH_OUT_STEPS_MAX,
  chainIssueWords,
  holdWords,
  isReachOutHold,
  validateReachOutChain,
  type ChainIssue,
  type ReachOutChainInput,
  type ReachOutSlot,
} from "./reach-out-words";

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
  /** Empty: every verified domain of the workspace (00183). */
  domain_ids: string[];
  signed_by: string;
  steps: ReachOutDraftStep[];
}

/** The words a new chain starts from: a first email and, once added, a short nudge. The owner's to change. */
export const REACH_OUT_FIRST_WORDS = {
  subject: "A quick one for {{business}}",
  body: "{{opening}}\n\nI run {{your business}}, and we help businesses like yours. Would it be worth a short call?\n\n{{your name}}",
  nudge: "Just checking this reached you. Happy to send a few details if it's useful.\n\n{{your name}}",
} as const;

/** The pace a new chain starts at: one email every twelve minutes or so. */
export const REACH_OUT_GAP_FIRST = 12;

/** A chain's name when it is given none: the search it writes to. */
export function reachOutDefaultName(searchName: string): string {
  return `Reach out · ${searchName}`.slice(0, 80);
}

/** The draft a sheet opens as: the chain being changed, or a new one over the search, signed with the member's name. */
export function reachOutDraftOf(p: {
  chain: ReachOutChainDto | null;
  searchName: string;
  signedBy: string | null;
  includeUnconfirmed?: boolean;
}): ReachOutDraft {
  const c = p.chain;
  if (c)
    return {
      name: c.name,
      include_unconfirmed: c.include_unconfirmed,
      gap_minutes: c.gap_minutes,
      domain_ids: c.domain_ids,
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
    domain_ids: [],
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
    domain_ids: d.domain_ids,
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
      steps[i.step]![i.field].push(words);
  }
  return out;
}

/** A slot put in at the caret of the field last focused, and where the caret goes after it. */
export function insertSlotAt(text: string, at: number | null, slot: ReachOutSlot): { text: string; caret: number } {
  const where = at === null || at < 0 || at > text.length ? text.length : at;
  const token = `{{${slot}}}`;
  return { text: text.slice(0, where) + token + text.slice(where), caret: where + token.length };
}

/**
 * How many a day the chosen domains allow each (the sheet's "a day per domain"): the least of their ramps, since a
 * run's day is paced by the domain that may send least; and the days that one has sent. None chosen is every verified
 * domain. Nothing to send from is a share of 0.
 */
export function reachOutSheetPaceOf(
  domains: Array<{ id: string; state: string; sent_days: number }>,
  picked: string[],
): { share: number; sentDays: number; domains: number } {
  const from = domains.filter((d) => d.state === "verified" && (picked.length === 0 || picked.includes(d.id)));
  if (from.length === 0) return { share: 0, sentDays: 0, domains: 0 };
  const least = from.reduce((a, b) => (domainDailyCap(b.sent_days) < domainDailyCap(a.sent_days) ? b : a));
  return { share: domainDailyCap(least.sent_days), sentDays: least.sent_days, domains: from.length };
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
      return "This business is missing a value your words name, so its email would wait.";
    case "no_business_address":
      return "Add your business's address in Settings › Business: every email carries it at the foot.";
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

/** Whether another domain may be picked: a chain names five at most (ReachOutChainSchema). */
export function reachOutMayPickDomain(d: ReachOutDraft): boolean {
  return d.domain_ids.length < REACH_OUT_DOMAINS_MAX;
}

/** A read the sheet draws from: in, still out, or failed. */
type ReachOutSheetRead = "in" | "reading" | "failed";

/**
 * What the sheet cannot say yet because a read it draws from is not in: the sending domains (Setup's read) and the
 * booking link (Settings' read). Unread is never "none": the sheet says it is reading, and Start waits.
 */
export function reachOutSheetUnreadOf(r: { domains: ReachOutSheetRead; settings: ReachOutSheetRead }): string | null {
  if (r.domains === "failed" || r.settings === "failed")
    return "Your sending domains or your booking link couldn't be read. Start waits until they are; reload to try again.";
  if (r.domains === "reading" || r.settings === "reading") return "Reading your sending domains and your booking link…";
  return null;
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
    : {
        tone: "good" as const,
        text:
          saved.rechecked > 0
            ? `Saved. ${saved.rechecked === 1 ? "1 email waiting to go is" : `${saved.rechecked} emails waiting to go are`} checked again against these words.`
            : "Saved. Its next run writes these words.",
      };
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
  everyDomain: "Every verified domain",
  domainsMax: `Up to ${REACH_OUT_DOMAINS_MAX} domains, or every verified one.`,
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
