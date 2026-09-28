/**
 * How a workspace's customers buy (tenants.sells_by, 0008), and the one switch the deal layer hangs on
 * (dealsAreOn): the question and its answers, what Settings › Business says of them, and whether a receptionist
 * may have no booking link. The deal itself is deal-vm.ts's.
 */
import type { SchemaSet } from "../shared/schema-sets";

/**
 * How a workspace's customers buy (tenants.sells_by, 00160): they book an
 * appointment, or some get a proposal first. Null is not asked yet. The deal
 * layer is there or absent by this answer and nothing else (dealsAreOn).
 */
export const SELLS_BY = ["booking", "proposal"] as const;
export type SellsBy = SchemaSet<"tenants.sells_by">;
export const SELLS_BY_QUESTION = "How customers buy";
export const SELLS_BY_WORDS: Record<SellsBy, { label: string; sentence: string }> = {
  booking: { label: "They book an appointment", sentence: "Bookings, reminders and the booking link." },
  proposal: {
    label: "Some get a proposal first",
    sentence: "Adds deals: a proposal on each person, a Pipeline in People, and a Deals section in Reports.",
  },
};

export function isSellsBy(s: unknown): s is SellsBy {
  return typeof s === "string" && (SELLS_BY as readonly string[]).includes(s);
}

/** What the workspace route answers for anything but the two answers: the question and both labels (deals.test holds them). */
export const SELLS_BY_REFUSAL = "How customers buy: they book an appointment, or some get a proposal first.";

/**
 * Whether deals are on in this workspace (0008): exactly when it says some of
 * its customers get a proposal first. The one predicate every gate reads --
 * the person's page, People's lists and column, the thread, Today, Reports,
 * Ask. A consult-first service is a booking rule, and a deal on file switches
 * nothing.
 */
export function dealsAreOn(sellsBy: string | null | undefined): boolean {
  return sellsBy === "proposal";
}

/**
 * Whether a receptionist may have no booking link: a business that says some customers get a proposal first quotes
 * before anyone books, and its receptionist takes their details instead (the first run's decision 2). One that books,
 * or has not said, is asked for one. The pages ask by this; the save does not, since the config cannot see the answer
 * and a receptionist with no link is read and answered either way (no-booking-link.ts).
 */
export function bookingLinkOptional(sellsBy: string | null | undefined): boolean {
  // The one answer that turns deals on: a business that quotes.
  return dealsAreOn(sellsBy);
}

/**
 * What a page says when a business that is asked for a booking link leaves it empty: the Business tab's own check
 * (business-tab-save.jsx btCheckBookingLink, which reads it through the bridge). Said as what the link is for, since a
 * receptionist with none is still read and answered.
 */
export const BOOKING_LINK_NEEDED = "The receptionist needs a booking link to send anyone who wants to book.";

/** The answer a new workspace's create card has chosen before anyone presses (0008): most businesses book one. */
export const SELLS_BY_FIRST: SellsBy = "booking";

/** "Needs a consult first", where deals are on (0008): a consultation for one of those is where a deal starts. */
export const CONSULT_FIRST_DEAL_HINT = "A consultation for these is the first step of a deal.";

/** What Settings › Business says of the answer (0008): its row, the choice, and what the answer switches there. */
export interface SellsByVM {
  /** The row's label, and the choice's name. */
  question: string;
  /** The answer's label; null where it was never said. */
  value: string | null;
  /** What the row says with no answer. */
  empty: string;
  /** The row's act, and what a screen reader hears it as: its words with the question. */
  act: string;
  name: string;
  /** The two answers, each with what choosing it means: the kit's RecordToggleGroup options. */
  choices: { value: SellsBy; label: string; hint: string }[];
  /** What stops a Save with neither chosen: the route's own refusal. */
  refusal: string;
  /** What the create card has chosen before anyone presses: the answer, or they book an appointment. */
  first: SellsBy;
  /** Deals are on here (dealsAreOn). */
  dealsOn: boolean;
  /** The hint the consult-first row carries where deals are on; null where they are off. */
  consultHint: string | null;
}

/**
 * The view model of the answer for the Business tab. `answer` is the workspace's `sells_by` as the workspace list
 * carries it; anything but the two answers is never said. Pure.
 */
export function sellsByVM(answer: string | null | undefined): SellsByVM {
  const said = isSellsBy(answer) ? answer : null;
  const on = dealsAreOn(said);
  const verb = said ? "Change" : "Choose";
  return {
    question: SELLS_BY_QUESTION,
    value: said ? SELLS_BY_WORDS[said].label : null,
    empty: "Not said yet",
    act: said ? "Change" : "Choose one",
    name: `${verb} ${SELLS_BY_QUESTION.toLowerCase()}`,
    choices: SELLS_BY.map((a) => ({ value: a, label: SELLS_BY_WORDS[a].label, hint: SELLS_BY_WORDS[a].sentence })),
    refusal: SELLS_BY_REFUSAL,
    first: said ?? SELLS_BY_FIRST,
    dealsOn: on,
    consultHint: on ? CONSULT_FIRST_DEAL_HINT : null,
  };
}

/**
 * The toast once an answer is saved (0008): what it switched. Turning deals off says that those on file are kept,
 * since every surface hides them and answering "proposal" again brings them back.
 */
export function sellsBySaved(was: string | null | undefined, now: SellsBy): string {
  if (dealsAreOn(now)) return "Saved — deals are on.";
  return dealsAreOn(was)
    ? "Saved — deals are off. Any already recorded are kept."
    : "Saved — customers book an appointment.";
}
