/**
 * The lead sheet (the canvas "Lead sheet, redesigned", 1 Nov 2026): who they are, one card that says what this lead needs
 * from you now (lead-sheet-now.ts), five folded lines that answer before they open (lead-sheet-lines.ts), and a dock
 * of only what to press. Add is the one verb; the picker the one place a sequence is chosen or made; where a lead stands
 * is the sequence's own reading (contracts sequence-place.ts), never worked out here. Every sentence the sheet says is
 * here and in those modules.
 *
 *   leadSheetStateOf     which state: needs review, finding an email, a phone and no email, a gap, in another sequence,
 *                        in a sequence, they replied, closed, or ready
 *   leadSheetClosedOf    what stopped, in words, and the one fix that exists
 *   leadVerdictOf        the verdict first: Strong fit, Worth a look, Long shot, or Left out with the finder's reason
 *   leadPickerRowsOf     the picker: each sequence to leads Add can go to, by its state, and New sequence
 *   leadPileEndOf        the pile's end: what went where, by sequence, each row its own act
 *   leadSheetAboutOf     the place or the company as its source knows it, each fact said once
 */
import { plural } from "../../shared/words";
import { runApproveWords } from "../../shell/campaign-rooms";
import type { LeadCardCheck, LeadCardEmailVM } from "../lead-card";
import type { LeadPeekVM } from "../lead-peek";
import { LEAD_DIRECTORY_WORDS } from "../lead-kind";
import { LEAD_CLOSED_WORDS, LEAD_LEFT_OUT_WORD, type LeadClass, type LeadStage } from "../lead-words";
import type { HoldDoor } from "../../reach-out/reach-out-words";
import type { LeadEmailState } from "../search/sets";
import type { SequencePlaceDto } from "../../sequences/sequence-place";
import { placeSpanOf } from "../../sequences/sequence-place";
import type { SequenceRowDto } from "../../sequences/sequence-dto";
import type { SequenceState } from "../../sequences/sequence";

/* ------------------------------------------------------------------------------------------------ the words -- */

/** The sheet's words: its head, its sections, the picker, New, and the pile's end. */
export const LEAD_SHEET_WORDS = {
  label: "About this lead",
  /** Said after a beat where a read is slow: nothing under the name is drawn before the reads that decide it. */
  reading: "Reading where they stand",
  /** What failed, where their place could not be read (the kit's FailedRead). */
  unread: "where they stand",
  raise: "Show everything about them",
  lower: "Back to half",
  close: "Close",
  more: "More",
  moreOf: "More for this lead",
  back: "Back",
  /** An email drawn whole: who it is from and to. */
  emails: { from: "From", to: "To" },
  /** The doors at the head: each opens outside the app. */
  doors: { website: "Website", call: "Call", maps: "Maps" },
  /** The email on the card. */
  mail: {
    to: (who: string) => `To ${who}`,
    ifAdded: (who: string) => `If you add them · to ${who}`,
    readAll: "Read it all",
    less: "Show less",
    rewrite: "Rewrite the opening",
    writing: "Being written, a minute or two.",
  },
  listing: "Listing",
  claimed: "Claimed by the owner",
  unclaimed: "Nobody has claimed it",
  hours: "Hours",
  size: "Size",
  reviews: "Reviews",
  where: "Where",
  from: "From",
  directory: "A business directory",
  whatWeKeep: "What we keep",
  noListing: "No listing",
  /** Contact: where the sequence writes, and changing who it writes to. */
  writesHere: "The sequence writes here",
  writeHere: "Write here",
  checkedMailbox: "Mailbox checked",
  notConfirmed: "Not confirmed",
  emailOnSite: "Email found on its contact page",
  /** Sequence, before one: the sequence Add goes to and the emails they'd get, or why none can have them. */
  ifAdded: "If you add them",
  stops: "Their first email waits for your OK.",
  noPick: "Pick a sequence to see the emails they'd get.",
  noEmailToWrite: "No email to write to: no sequence can take them. Call them instead.",
  openSequence: (name: string) => `Open ${name}`,
  /** The lead's More: the rare acts. */
  menu: {
    theyWrote: "They wrote back…",
    copy: "Copy details",
    copied: "Copied what is known of them",
    never: "Never write to them again",
    neverHint: "Stops every sequence",
    erase: "Erase this lead",
  },
  /** The picker: a step of the same sheet. */
  picker: {
    title: (name: string) => `Add ${name} to`,
    titleMany: (n: number) => `Add ${n} to`,
    sub: "Tap one to add. It becomes the pick for this search.",
    canJoin: (name: string) => `${name} can join any of these`,
    yours: "Your lead sequences",
    none: "No sequence takes leads yet. Make one by name; you write its emails when you're done here.",
    newOne: "New sequence",
    newLine: "Name it now; write its emails when you're done here",
    newLineMany: (n: number) => `Name it; the ${n} wait in it as a draft`,
    pick: "the pick for this search",
  },
  /** Many at once, from the selection bar: the same picker and New, named by how many. */
  bulk: {
    noEmail: (n: number) => (n === 1 ? "1 has no email" : `${n} have no email`),
    addTo: (n: number, name: string) => `Add ${n} to ${name}`,
    addAny: (n: number) => `Add ${n} to a sequence`,
    choose: "Choose where they go",
    stay: (n: number) => (n === 1 ? "1 couldn't join and stays selected" : `${n} couldn't join and stay selected`),
    later: "Later",
    laterDone: (n: number) => `${plural(n, "lead", "leads")} put off for later`,
    more: "More",
  },
  /** New: a name and a start, mid-pile. */
  make: {
    title: "New sequence",
    sub: (name: string) => `${name} goes in it. Nothing sends until you start it.`,
    subMany: (n: number) => `The ${n} go in it. Nothing sends until you start it.`,
    name: "Name",
    from: "Start from",
    copy: (name: string) => `Copy ${name}`,
    copyLine: "Same emails and waits, on a new list",
    change: "Change",
    ask: "A draft by Ask",
    askLine: "From your goal in Settings and this search",
    blank: "Blank",
    blankLine: "You write every email",
    create: (name: string) => `Create and add ${name}`,
    createMany: (n: number) => `Create and add ${n}`,
    drafting: "Writing a draft…",
  },
  /** The pile's end. */
  end: {
    title: (n: number) => (n ? `All ${n} decided` : "Nothing left to decide"),
    toSequence: (n: number, name: string) => `${n} to ${name}`,
    notFit: (n: number) => `${n} not a fit`,
    later: (n: number) => `${n} for later`,
    goThrough: "Go through them",
    approve: runApproveWords,
    write: "Write the emails in Sequences",
    writeNote: (n: number) => `Next: one set of emails for the ${n}, in the draft's record. Back brings you here.`,
    approveNote: "Their first batch waits for your OK: it carries leads you added.",
  },
  /** The pile's line over the card. */
  of: (at: number, of: number, search: string) => `${at} of ${of} · ${search}`,
  /** Adds go to: the pick, said on Leads over the rows. */
  addsGoTo: "Adds go to",
  noneYet: "Pick a sequence",
  /** Its last item: every lead shown, to a sequence of their own (Add opens at New). */
  newSequence: "New sequence for these…",
} as const;

/* ------------------------------------------------------------------------------------------------- the state -- */

/** The canvas's states: what the dock is read by, beside the lead's place. */
export type LeadSheetState =
  "review" | "finding" | "phone" | "gap" | "elsewhere" | "sequence" | "replied" | "closed" | "ready";

/** What the state is read from: the lead as the rows read it, and the two ways to them. */
export interface LeadSheetLead {
  cls: LeadClass;
  stage: LeadStage;
  emailState: LeadEmailState;
  hasEmail: boolean;
  canCall: boolean;
}

/** The reasons that are an address the door gave: a call or a gap, by whether a number is there. */
const ADDRESS_WHYS = new Set(["no_email", "invalid"]);
/** The reasons that are the sequence's own setting: the address can't be confirmed or checked. */
const SETTING_WHYS = new Set(["unconfirmed", "unchecked"]);
/** Why a place ended that closes the lead: it bounced. */
const BOUNCED = new Set(["bounced", "outreach_bounced"]);

/** A state the lead's own record and its place settle before anything is asked. */
function settledOf(lead: LeadSheetLead, place: SequencePlaceDto | null): LeadSheetState | null {
  if (lead.cls === "excluded") return "closed";
  if (lead.cls === "review") return "review";
  const g = place ? place.place.group : null;
  if (lead.stage === "converted" || g === "replied") return "replied";
  if (lead.stage === "archived" || (g === "left" && BOUNCED.has(place?.place.why ?? ""))) return "closed";
  return place ? "sequence" : null;
}

/** A state the add door's answer settles: another sequence, already on this one, an address, a setting, or no. */
function checkStateOf(check: LeadCardCheck | undefined, lead: LeadSheetLead): LeadSheetState | null {
  if (!check) return null;
  if (check.why === "elsewhere" || check.why === "written") return "elsewhere";
  if (check.why === "already") return "sequence";
  if (check.why === "checking") return "finding";
  if (ADDRESS_WHYS.has(check.why)) return lead.canCall ? "phone" : "closed";
  return SETTING_WHYS.has(check.why) ? "gap" : "closed";
}

/**
 * Which state the lead is in, by what is known of it in this order: its own record and its place (the one reader), the
 * add door's answer (the one predicate, never a second reading of the address here), then what its email says.
 */
export function leadSheetStateOf(p: {
  lead: LeadSheetLead;
  place: SequencePlaceDto | null;
  check: LeadCardCheck | undefined;
  email: Pick<LeadCardEmailVM, "blocked" | "note"> | null;
}): LeadSheetState {
  const settled = settledOf(p.lead, p.place) ?? checkStateOf(p.check, p.lead);
  if (settled) return settled;
  if (!p.lead.hasEmail || p.lead.emailState === "invalid") return p.lead.canCall ? "phone" : "closed";
  if (p.lead.emailState === "checking") return "finding";
  return p.email && p.email.blocked ? "gap" : "ready";
}

/** What stopped, as a closed lead says it, and the one fix that exists for it (none, where none does). */
export interface LeadSheetClosedVM {
  title: string;
  line: string;
  fix: "put_back" | "ready" | "call" | null;
}

/** What a closed lead says: left out, closed with its reason, bounced, or what the door said. */
export function leadSheetClosedOf(p: {
  lead: LeadSheetLead;
  closedReason: string | null;
  blocked: string | null;
}): LeadSheetClosedVM {
  const call = p.lead.canCall ? "call" : null;
  if (p.lead.cls === "excluded") return { title: LEAD_LEFT_OUT_WORD, line: "", fix: "put_back" };
  if (p.lead.stage === "archived") {
    const word =
      p.closedReason && p.closedReason in LEAD_CLOSED_WORDS
        ? LEAD_CLOSED_WORDS[p.closedReason as keyof typeof LEAD_CLOSED_WORDS]
        : "Closed";
    return { title: word, line: "Nothing is written to them.", fix: "ready" };
  }
  if (p.lead.emailState === "invalid")
    return { title: "Their address bounced", line: "Nothing more goes to it.", fix: call };
  if (!p.lead.hasEmail && !p.lead.canCall)
    return { title: "No way to reach them yet", line: "No address and no number were found.", fix: null };
  return { title: "Can't be written to", line: p.blocked ?? "This one can't be added.", fix: call };
}

/* ----------------------------------------------------------------------------------------------- the verdict -- */

/** The verdict first (the canvas's "the decision at a glance"): the fit's word, its tone, and the reason under it. */
export interface LeadVerdictVM {
  word: string;
  tone: "ok" | "warn" | "plain";
  /** Left out by the finder: its own call, with its reason in the word. */
  out: boolean;
}

/** Strong fit (green), Worth a look and Long shot (amber, the plain doubt), Left out and To review (plain). */
export function leadVerdictOf(vm: Pick<LeadPeekVM, "fit">): LeadVerdictVM {
  const cls = vm.fit.cls;
  if (cls === "strong") return { word: vm.fit.word, tone: "ok", out: false };
  if (cls === "look" || cls === "long") return { word: vm.fit.word, tone: "warn", out: false };
  return { word: vm.fit.word, tone: "plain", out: cls === "out" };
}

/* ------------------------------------------------------------------------------------------------- the acts -- */

/** What a press of the sheet does. */
export type LeadSheetAct =
  | "not_a_fit"
  | "later"
  | "add"
  | "pick"
  | "call"
  | "move"
  | "sequence"
  | "put_back"
  | "ready"
  | "keep"
  | "exclude"
  | "approve"
  | "decide"
  | "take_out"
  | "return"
  | "they_wrote"
  | "thread"
  | "next";

/** One press of the dock: what it does, its words and glyph, its key, and why it is off. */
export interface LeadSheetSlotVM {
  act: LeadSheetAct;
  label: string;
  icon: string;
  key: "a" | "l" | "n" | "c" | "j" | null;
  /** Add with ▾ beside it: the picker, one press away. */
  split?: boolean;
  /** A held email's answer, which the decide verb takes. */
  door?: HoldDoor;
  /** Why it is off, said at the control; null when it would go. */
  off: string | null;
}

export const sheetSlot = (
  act: LeadSheetAct,
  label: string,
  icon: string,
  key: LeadSheetSlotVM["key"] = null,
  more: Partial<Pick<LeadSheetSlotVM, "split" | "off" | "door">> = {},
): LeadSheetSlotVM => ({ act, label, icon, key, off: null, ...more });

/* ------------------------------------------------------------------------------------------------ the picker -- */

/** One sequence the picker offers: its name, its state's word and tone, its one line, and whether it is the pick. */
export interface LeadPickerRowVM {
  id: string;
  name: string;
  state: SequenceState;
  word: string;
  tone: "ok" | "warn" | "plain";
  line: string;
  picked: boolean;
}

const STATE_WORDS: Record<SequenceState, { word: string; tone: LeadPickerRowVM["tone"] }> = {
  on: { word: "On", tone: "ok" },
  draft: { word: "Draft", tone: "warn" },
  paused: { word: "Paused", tone: "plain" },
  ended: { word: "Ended", tone: "plain" },
};

/** A sequence's line in the picker: its steps and span and who is in it; a draft, who it holds; paused, that adds wait. */
function pickerLineOf(r: SequenceRowDto): string {
  const span = placeSpanOf(r.steps, r.days ?? 0);
  if (r.state === "draft") {
    const added = r.in_it > 0 ? `${r.in_it} added` : "Nobody added yet";
    return (r.unwritten ?? 0) > 0 ? `${added} · emails not written yet` : `${added} · ${span}`;
  }
  const inIt = `${r.in_it} in it`;
  return r.state === "paused" ? `${span} · ${inIt} · adds wait until it's on` : `${span} · ${inIt}`;
}

/**
 * The picker (the canvas's PhonePicker): every sequence to leads that has not ended, the pick first, then the newest, each
 * with its state and one line; New sequence follows (the sheet draws it). The one place a sequence is chosen or made.
 */
export function leadPickerRowsOf(rows: readonly SequenceRowDto[], picked: string | null): LeadPickerRowVM[] {
  return rows
    .filter((r) => r.starts === "leads" && r.state !== "ended")
    .sort((a, b) => (a.id === picked ? -1 : b.id === picked ? 1 : b.created_at.localeCompare(a.created_at)))
    .map((r) => ({
      id: r.id,
      name: r.name,
      state: r.state,
      ...STATE_WORDS[r.state],
      line: pickerLineOf(r),
      picked: r.id === picked,
    }));
}

/**
 * How New opens: a copy only of the search's own pick (the same kind of lead, written again); else Ask's draft where the
 * leads came from a search, since New over a search with no pick is a new kind of lead (the walk of 30 Oct 2026: agency
 * owners opened on a copy of an auto shops sequence); else a copy of the newest; else blank.
 */
export function newStartFirst(copies: readonly LeadPickerRowVM[], canAsk: boolean): "copy" | "ask" | "blank" {
  const first = copies[0];
  if (first && first.picked) return "copy";
  if (canAsk) return "ask";
  return first ? "copy" : "blank";
}

/* -------------------------------------------------------------------------------------------- the pile's end -- */

/** What one pile added to one sequence: how many, its state, and its batch waiting for an OK where there is one. */
export interface LeadPileAdded {
  id: string;
  name: string;
  state: SequenceState;
  n: number;
  /** Its batch waiting for your OK, and how many it holds: Approve N. */
  waiting: { batchId: string; people: number } | null;
}

/** One row of the pile's end: its words, its tone, and its own act. */
export interface LeadPileEndRowVM {
  key: string;
  icon: string;
  words: string;
  word: string | null;
  tone: "ok" | "warn" | "plain";
  act: { kind: "write" | "approve" | "later"; label: string; sequenceId: string | null; batchId: string | null } | null;
}

/** The pile's end: what went where, by sequence, the next step the real one. */
export interface LeadPileEndVM {
  title: string;
  rows: LeadPileEndRowVM[];
  note: string | null;
  /** The press under it: Write the emails for a draft that took leads; none where each row carries its act. */
  primary: { label: string; sequenceId: string } | null;
}

/**
 * The pile's end (the canvas's PhoneEnd): each sequence the pile added to, with its state and its act (a draft says Write
 * the emails, one that is on says Approve N where its first batch waits), how many were not a fit, and those for later
 * with Go through them. The next step is the real one: a draft that took leads is written first.
 */
export function leadPileEndOf(p: { added: readonly LeadPileAdded[]; notFit: number; later: number }): LeadPileEndVM {
  const W = LEAD_SHEET_WORDS.end;
  const decided = p.added.reduce((n, a) => n + a.n, 0) + p.notFit + p.later;
  const rows: LeadPileEndRowVM[] = p.added
    .filter((a) => a.n > 0)
    .map((a) => ({
      key: a.id,
      icon: "plus",
      words: W.toSequence(a.n, a.name),
      ...STATE_WORDS[a.state],
      act:
        a.state === "on" && a.waiting
          ? { kind: "approve", label: W.approve(a.waiting.people), sequenceId: a.id, batchId: a.waiting.batchId }
          : null,
    }));
  if (p.notFit > 0)
    rows.push({ key: "not_a_fit", icon: "x", words: W.notFit(p.notFit), word: null, tone: "plain", act: null });
  if (p.later > 0)
    rows.push({
      key: "later",
      icon: "clock",
      words: W.later(p.later),
      word: null,
      tone: "plain",
      act: { kind: "later", label: W.goThrough, sequenceId: null, batchId: null },
    });
  const draft = p.added.find((a) => a.state === "draft" && a.n > 0) ?? null;
  const waits = p.added.some((a) => a.state === "on" && a.waiting);
  return {
    title: W.title(decided),
    rows,
    note: draft ? W.writeNote(draft.n) : waits ? W.approveNote : null,
    primary: draft ? { label: W.write, sequenceId: draft.id } : null,
  };
}

/* --------------------------------------------------------------------------------------------- the facts -------- */

/** A fact about them, and a tip where a press says more of it. */
export interface LeadSheetFactVM {
  k: string;
  v: string;
  tip: string | null;
}

/** The facts its own rows say, or the head and History do: never again from the listing's list. */
const SAID_ELSEWHERE: ReadonlySet<string> = new Set(["Rated", "Listing", "Kind", "Found at"]);

const aboutFact = (k: string, v: string, tip: string | null = null): LeadSheetFactVM => ({ k, v, tip });

/** The rating with how many rated it, and what five bars said that an average cannot, where it is worth saying. */
const reviewsOf = (rated: NonNullable<LeadPeekVM["rated"]>): string =>
  [`★ ${rated.score} from ${rated.reviews}`, rated.low].filter(Boolean).join(" · ");

/** The place or the company as its source knows it: its own words, then each fact once, nothing its source didn't say. */
export function leadSheetAboutOf(
  vm: Pick<LeadPeekVM, "rated" | "weekSummary" | "where" | "distance" | "facts" | "company" | "about" | "claimed">,
): { text: string | null; rows: LeadSheetFactVM[] } {
  const W = LEAD_SHEET_WORDS;
  const { company } = vm;
  const where = vm.where ? [vm.where.line, vm.distance].filter(Boolean).join(" · ") : null;
  const rows: LeadSheetFactVM[] = company
    ? [
        ...(company.size ? [aboutFact(W.size, company.size)] : []),
        // Where its people came from and what we keep of them is a tip, never a heading of a paragraph's length.
        aboutFact(W.from, LEAD_DIRECTORY_WORDS.source, company.source || null),
      ]
    : [
        ...(vm.weekSummary ? [aboutFact(W.hours, vm.weekSummary)] : []),
        ...(vm.claimed === null ? [] : [aboutFact(W.listing, vm.claimed ? W.claimed : W.unclaimed)]),
        ...(vm.rated ? [aboutFact(W.reviews, reviewsOf(vm.rated))] : []),
        ...(where ? [aboutFact(W.where, where)] : []),
      ];
  return {
    text: vm.about,
    rows: [...rows, ...vm.facts.filter((f) => !SAID_ELSEWHERE.has(f.k)).map((f) => aboutFact(f.k, f.v))],
  };
}
