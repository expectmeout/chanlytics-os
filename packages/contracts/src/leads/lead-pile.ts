/**
 * The pile (the lead workbench, 00423): a search's ready leads, one at a time, each decided (added to a reach-out,
 * worked, set aside) or put off for Later, which brings it back at the end. leads_page's `pile` sort orders it
 * (undecided, then later, oldest first, then the decided; within each the strongest fit, a checked address before a
 * number alone, the newest), lead_pile_counts counts it, and every sentence it says is here.
 *
 * Later is the pile's soft word: nothing is written to the lead and its stage does not move (Skip stays the run
 * page's word, for a send). docs/glossary.md has its row.
 */
import { plural } from "../shared/words";
import type { LeadRowDto } from "./lead-dtos";
import type { LeadClass, LeadStage } from "./lead-words";

/** The pile's progress line's numbers (00423 lead_pile_counts): of a search's shown members, against the list it adds to. */
export interface LeadPileCountsDto {
  total: number;
  /** On the list the pile adds to. */
  added: number;
  /** With a reach-out already (lead_chain_of: one lead, one reach-out); absent before it was counted. */
  elsewhere?: number;
  /** No longer Ready: worked, or set aside. */
  closed: number;
  /** Put off in this pass. */
  later: number;
  /** Not decided, not put off. */
  left: number;
}

/** The pile's words. */
export const LEAD_PILE_WORDS = {
  start: "Go through them",
  startTip: "One lead at a time: add it to a reach-out, put it off, or say it isn't a fit.",
  head: (search: string) => `Going through “${search}”`,
  target: "Adds go to",
  newList: "A new list",
  later: "Later",
  laterTip: "Put it off for now. Nothing is written to them, and it comes back at the end of the pile.",
  laterDone: "Put off for later",
  notFit: "Not a fit",
  add: (target: string) => `Add to “${target}”`,
  hold: "Add to a new list",
  held: (n: number) => `${plural(n, "lead", "leads")} for a new list`,
  writeHeld: (n: number) => `Write to the ${n}`,
  details: "Details",
  leave: "Done for now",
  end: "That's the pile",
  endSub: (later: number) =>
    later > 0
      ? `${plural(later, "lead", "leads")} put off for later. Go through them now?`
      : "Every lead here is decided.",
  laterAgain: "Go through the later ones",
  undo: "Undo",
  undoGone: "That was already undone",
} as const;

/** The pile's progress line: "12 of 40 decided · 3 for later", and how far through it is, 0 to 1. */
export interface LeadPileProgressVM {
  text: string;
  /** Decided of the whole, 0 to 1; 0 for an empty pile. */
  share: number;
  /** The pile is through: nothing left undecided (some may be put off). */
  done: boolean;
}

export function leadPileProgressOf(c: LeadPileCountsDto): LeadPileProgressVM {
  const decided = c.added + (c.elsewhere ?? 0) + c.closed;
  const parts = [`${decided} of ${c.total} decided`];
  if (c.later > 0) parts.push(`${c.later} for later`);
  return { text: parts.join(" · "), share: c.total > 0 ? decided / c.total : 0, done: c.left === 0 };
}

/** What the pile reads of a row beyond its words (00423): the reach-out it goes with, and when it was put off. */
export interface LeadPileFacts {
  chainId: string | null;
  laterAt: string | null;
}

export const leadPileFactsOf = (r: Pick<LeadRowDto, "chain_id" | "member">): LeadPileFacts => ({
  chainId: r.chain_id ?? null,
  laterAt: r.member.later_at ?? null,
});

/**
 * Whether a row is still to decide in this pass of the pile, in the order the database sorted them (the one order):
 * a Needs review pile's rows while they are in review; a Ready pile's while Ready and with no reach-out (lead_chain_of:
 * one lead, one reach-out). The first pass takes the ones not put off; the second, the ones put off for later.
 */
export function leadPileOpen(
  r: { cls: LeadClass; stage: LeadStage } & Partial<LeadPileFacts>,
  pile: { cls: LeadClass; pass: "first" | "later" },
): boolean {
  const undecided = pile.cls === "review" ? r.cls === "review" : r.stage === "ready" && !r.chainId;
  return undecided && (pile.pass === "first" ? !r.laterAt : !!r.laterAt);
}

/** What a press of the pile's rail does. */
export type LeadPileAct = "not_a_fit" | "later" | "add" | "hold" | "keep" | "exclude";

/** One of the rail's three places: its act, its words, its key, how it looks, and the right it asks for. */
export interface LeadPileSlot {
  act: LeadPileAct;
  label: string;
  key: "n" | "l" | "a";
  look: "secondary" | "primary";
  /** The right the act's door checks (ROLE_PERMS): Keep and Exclude count against the month, so they are find's. */
  right: "approve" | "find";
}

/**
 * The rail's three places, left to right: no, not now, yes. A Needs review pile leaves out, puts off or keeps; a
 * Ready pile says Not a fit, puts off, or adds to its reach-out (to a new list when it has none yet: held, and written
 * to together at the end).
 */
export function leadPileRailOf(p: { cls: LeadClass; target: string | null }): LeadPileSlot[] {
  const later: LeadPileSlot = {
    act: "later",
    label: LEAD_PILE_WORDS.later,
    key: "l",
    look: "secondary",
    right: "approve",
  };
  if (p.cls === "review")
    return [
      { act: "exclude", label: "Leave out", key: "n", look: "secondary", right: "find" },
      later,
      { act: "keep", label: "Keep", key: "a", look: "primary", right: "find" },
    ];
  return [
    { act: "not_a_fit", label: LEAD_PILE_WORDS.notFit, key: "n", look: "secondary", right: "approve" },
    later,
    p.target
      ? { act: "add", label: LEAD_PILE_WORDS.add(p.target), key: "a", look: "primary", right: "approve" }
      : { act: "hold", label: LEAD_PILE_WORDS.hold, key: "a", look: "primary", right: "approve" },
  ];
}

/* ------------------------------------------------------------------------- Back today (decision 9 of the workbench) */

/** A lead whose own day to hear back has come (00423 leads_back_today): written to by hand, never by a reach-out again. */
export interface LeadBackDto {
  lead_id: string;
  business_name: string;
  /** The day they asked for. */
  resume_at: string;
  contact_id: string | null;
}

/** Back today's words: the band over Leads' rows, and each lead's line in the words of what they asked. */
export const LEAD_BACK_WORDS = {
  head: "Back today",
  tip: "They asked to hear from you on a day that has come. Nothing writes to them by itself: write to them yourself.",
  line: (name: string, day: string) => `${name} asked to hear from you ${day}`,
  more: (n: number) => `${n} more`,
} as const;
