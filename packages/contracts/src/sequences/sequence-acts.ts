/**
 * What a sequence's head offers past its one act (decision 0060; the parity review of 15 Oct 2026): its More (Ask about it,
 * Run now, Rename, and on a phone Pause or Turn on and Skip), and Turn on asked first, as a campaign's Resume is (decision 7,
 * the wiring's second audit S9-2). Pure: the clock is an argument, and Turn on's when and how many are said by the rule the
 * home's rows say a Resume by (lifecycle-tiles.ts resumeDetailOf), over the record's first step and its reach.
 */
import { resumeDetailOf } from "../playbooks/lifecycle/lifecycle-tiles";
import { LIFECYCLE_WORDS } from "../playbooks/lifecycle/lifecycle-words";
import { campaignRunsOn } from "../playbooks/playbook-schedule";
import type { SequenceReachDto, SequenceRecordDto, SequenceRowDto } from "./sequence-dto";

/** The head's words past its one act. */
export const SEQUENCE_ACT_WORDS = {
  more: (name: string) => `More for ${name}`,
  askAbout: "Ask about it",
  runNow: "Run now",
  runNowTip:
    "Runs its first step now, as your decision: it goes without waiting for an OK, and outside the sending hours it goes when they open",
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
 * holds that one).
 */
export function sequenceRunsNow(
  row: Pick<SequenceRowDto, "starts" | "first" | "needs">,
  at: { tz: string; nowMs: number },
): boolean {
  const first = row.first;
  if (!first || (row.starts !== "moment" && row.starts !== "list") || row.needs.waiting > 0) return false;
  return campaignRunsOn(first, { tz: at.tz, now: new Date(at.nowMs) });
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
 * next, from the record (its hour, its last day and the day it last ran), and to about how many, from its reach (GET
 * sequences/:id/reach; undefined while it is read: the question alone, nothing guessed), and what that batch does by its
 * own mode (decision 0064: it waits for an OK where its words are new, it goes on its own under Sends it); a workspace
 * paused for billing says so instead of a time, as the home's rows do. A sequence to leads says what a reach-out's Resume
 * says.
 */
export function sequenceResumeAsk(
  rec: { sequence: Pick<SequenceRowDto, "name" | "starts" | "first" | "mode"> } & Pick<
    SequenceRecordDto,
    "last_run_for"
  >,
  reach: SequenceReachDto | null | undefined,
  at: { tz: string; nowMs: number },
): SequenceResumeAsk {
  const W = LIFECYCLE_WORDS.ledger.resume;
  const { name, starts, first, mode } = rec.sequence;
  const step =
    first && reach
      ? {
          run_hour: first.run_hour,
          last_run_for: rec.last_run_for ?? null,
          trigger: first.trigger,
          until: first.until,
          candidates: reach.candidates,
          cap_per_run: reach.cap_per_run,
          mode,
          words_ok_at: first.words_ok_at,
        }
      : null;
  const detail =
    starts === "leads" ? W.chain : step ? resumeDetailOf(step, { ...at, paused: reach?.paused === true }) : null;
  return { question: SEQUENCE_ACT_WORDS.resumeAsk(name), detail, yes: SEQUENCE_ACT_WORDS.resumeYes };
}
