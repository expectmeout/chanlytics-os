/**
 * What a sequence's head offers past its one act (decision 0060; the parity review of 15 Oct 2026): its More (Ask about it,
 * Run now, Rename, and on a phone Pause or Turn on and Skip), and Turn on asked first, as a campaign's Resume is (decision 7,
 * the wiring's second audit S9-2). Pure: the clock is an argument, and Turn on's when and how many are read off the
 * playbooks surface's row of the sequence's first step (lifecycle-tiles.ts resumeDetailOf), the one the home's rows ask.
 */
import { resumeDetailOf, workspacePausedOf } from "../playbooks/lifecycle/lifecycle-tiles";
import type { LifecyclePlaybooks } from "../playbooks/lifecycle/lifecycle-types";
import { LIFECYCLE_WORDS } from "../playbooks/lifecycle/lifecycle-words";
import { campaignRunsOn } from "../playbooks/playbook-schedule";
import type { SequenceRowDto } from "./sequence-dto";
import { SEQUENCE_EDIT_WORDS } from "./sequence-tab-words";

/** The head's words past its one act. */
export const SEQUENCE_ACT_WORDS = {
  more: (name: string) => `More for ${name}`,
  askAbout: "Ask about it",
  runNow: "Run now",
  runNowTip:
    "Runs its first step now, at your request: it waits for your OK where you approve its batches, and outside the sending hours it goes when they open",
  rename: "Rename",
  name: "Name",
  save: "Save",
  cancel: "Cancel",
  resumeAsk: (name: string) => `Turn ${name} on?`,
  resumeYes: "Yes, turn it on",
} as const;

/**
 * Whether Run now is offered: a sequence on a moment or a list whose first step runs on the business's day (contracts
 * campaignRunsOn, the one rule every page asks: on, and not past its last day), with no batch waiting for an OK (the notice
 * holds that one). A follow-up to a proposal where deals are off is the door's to refuse, in its words.
 */
export function sequenceRunsNow(
  row: Pick<SequenceRowDto, "starts" | "first" | "needs">,
  at: { tz: string; nowMs: number },
): boolean {
  const first = row.first;
  if (!first || (row.starts !== "moment" && row.starts !== "list") || row.needs.waiting > 0) return false;
  return campaignRunsOn(first, { tz: at.tz, now: new Date(at.nowMs), dealsOn: true });
}

/** Turn on, asked: its question, what it says of the next run, and its Yes. */
export interface SequenceResumeAsk {
  question: string;
  /** When it runs next and to about how many; a sequence to leads says its next emails go on its next run. Null unread. */
  detail: string | null;
  yes: string;
}

/**
 * A paused sequence's Turn on, asked first (decision 7): a sequence on a moment or a list says when its first step runs
 * next and to about how many, from the playbooks surface's row of that step (undefined while the surface is read: the
 * question alone, nothing guessed), and that it sends on its own where its class does (`mode`, the record's own); a
 * workspace paused for billing says so instead of a time, as the home's rows do. A sequence to leads says what a
 * reach-out's Resume says.
 */
export function sequenceResumeAsk(
  row: Pick<SequenceRowDto, "name" | "starts" | "first">,
  playbooks: LifecyclePlaybooks | null | undefined,
  at: { tz: string; nowMs: number; mode: string | null },
): SequenceResumeAsk {
  const W = LIFECYCLE_WORDS.ledger.resume;
  const id = row.first?.id;
  const first = id ? playbooks?.rows.find((p) => p.id === id) : undefined;
  const paused = workspacePausedOf({ playbooks: playbooks ?? undefined, broadcasts: undefined });
  const detail = row.starts === "leads" ? W.chain : first ? resumeDetailOf(first, { ...at, paused }) : null;
  return { question: SEQUENCE_ACT_WORDS.resumeAsk(row.name), detail, yes: SEQUENCE_ACT_WORDS.resumeYes };
}

/** What must still hold for a step after the first to go, as the editor offers it ("If they haven't booked"). */
function stepHoldWords(onlyIf: readonly string[]): string {
  const H = SEQUENCE_EDIT_WORDS.holds;
  const booking = onlyIf.includes("no_booking");
  const reply = onlyIf.includes("no_reply");
  return booking && reply ? H.neither : booking ? H.no_booking : reply ? H.no_reply : H.always;
}

/** Ask's card for a sequence (contracts sequenceCardSpec): its title by its op, and what a step's wait says. */
export const SEQUENCE_CARD_WORDS = {
  add: (place: number, name: string) => `Add step ${place} to ${name}`,
  wait: (place: number, name: string) => `Change step ${place} of ${name}`,
  words: (place: number, name: string) => `New words for step ${place} of ${name}`,
  remove: (place: number, name: string) => `Take step ${place} of ${name} away`,
  after: (days: number, onlyIf: readonly string[]) =>
    `${SEQUENCE_EDIT_WORDS.days(days)} after the step before · ${stepHoldWords(onlyIf)}`,
} as const;
