/**
 * What a sequence's head offers, judged once (decision 0072): every act its head, its More and a phone's dock may draw,
 * each offered or not with why, read by the page and by Ask's cards alike; the head's words past its one act (decision
 * 0060; the parity review of 15 Oct 2026), and Turn on asked first, as a campaign's Resume is (decision 7, the wiring's
 * second audit S9-2). Pure: the clock is an argument, and Turn on's when and how many are said by the rule the home's rows
 * say a Resume by (lifecycle-tiles.ts resumeDetailOf), over the record's first step and its reach.
 *
 *   sequenceActsOf      every act of the head at once: { ok: true }, or { ok: false, because, instead? }
 *   SEQUENCE_ACT_WHY    each reason in a person's words (the model says them in the turn's own language)
 */
import { resumeDetailOf } from "../playbooks/lifecycle/lifecycle-tiles";
import { LIFECYCLE_WORDS } from "../playbooks/lifecycle/lifecycle-words";
import { campaignRunsOn } from "../playbooks/playbook-schedule";
import { triggerOf } from "../playbooks/playbook-triggers";
import type { SequenceReachDto, SequenceRecordDto, SequenceRowDto } from "./sequence-dto";
import { leadDraftDockOf } from "./sequence-lead-build";

/** The head's words past its one act. */
export const SEQUENCE_ACT_WORDS = {
  more: (name: string) => `More for ${name}`,
  /** The head's More where no act stands to carry it as a caret (Ruben, 20 Oct 2026: no three dots): its word. */
  moreWord: "More",
  askAbout: "Ask about it",
  runNow: "Run now",
  runNowTip:
    "Runs its first step now, as your decision: it goes without waiting for an OK, and outside the sending hours it goes when they open",
  rename: "Rename",
  /** A one-off that went, sent again: New's Send once, filled with what it sent (its message, who it went to, its values). */
  sendAgain: "Send it again",
  sendAgainTip: "A new one-off, filled with what this one sent: its message, who it went to and its values",
  name: "Name",
  save: "Save",
  cancel: "Cancel",
  resumeAsk: (name: string) => `Turn ${name} on?`,
  resumeYes: "Yes, turn it on",
} as const;

/** The acts of a sequence's head, in the order its More lists them. */
export const SEQUENCE_ACTS = [
  "start",
  "pause",
  "turn_on",
  "end",
  "discard",
  "run_now",
  "rename",
  "cancel_send",
  "send_again",
] as const;
export type SequenceAct = (typeof SEQUENCE_ACTS)[number];

/** Why an act is not offered: each one a fact of the record, said by SEQUENCE_ACT_WHY. */
export const SEQUENCE_ACT_REASONS = [
  "one_off",
  "not_a_one_off",
  "to_leads",
  "ended",
  "not_a_draft",
  "email_to_write",
  "not_on",
  "not_paused",
  "never_ran",
  "ran",
  "wrote",
  "unread",
  "batch_waiting",
  "not_today",
  "not_scheduled",
  "not_sent",
  "freed_time",
] as const;
export type SequenceActReason = (typeof SEQUENCE_ACT_REASONS)[number];

/** Each reason in a person's words: what Ask says when it is asked for an act the head does not offer. */
export const SEQUENCE_ACT_WHY: Record<SequenceActReason, string> = {
  one_off: "A one-off goes once, on its day.",
  not_a_one_off: "Only a one-off is cancelled or sent again.",
  to_leads: "A sequence to leads goes on its own days: it is paused, never ended or run by hand.",
  ended: "It has ended.",
  not_a_draft: "It has been on already.",
  email_to_write: "An email of it is still to write.",
  not_on: "It is not on.",
  not_paused: "It is not paused.",
  never_ran: "It never ran, so nothing of it would be kept.",
  ran: "It has run, and what it sent stays in its History.",
  wrote: "It has written to leads, and what it sent stays.",
  unread: "What it has sent could not be read just now.",
  batch_waiting: "A batch of it waits for your OK.",
  not_today: "It runs nothing today.",
  not_scheduled: "It is not waiting for its day any more.",
  not_sent: "It has not gone yet.",
  freed_time: "It runs when a cancellation frees a time, never by hand.",
};

/** An act offered, or not, with why and the act offered in its place. */
export type SequenceOffer = { ok: true } | { ok: false; because: SequenceActReason; instead?: SequenceAct };
export type SequenceActs = Record<SequenceAct, SequenceOffer>;

const OK: SequenceOffer = { ok: true };
const no = (because: SequenceActReason, instead?: SequenceAct): SequenceOffer =>
  instead ? { ok: false, because, instead } : { ok: false, because };

/** What the judge reads of a record: its row, a sequence to leads' chain, and whether it ever ran or wrote. */
export type SequenceActsInput = Pick<SequenceRecordDto, "sequence" | "chain" | "ran" | "wrote">;

/**
 * Whether Run now is offered: a sequence on a moment or a list whose first step runs on the business's day (contracts
 * campaignRunsOn, the one rule every page asks: on, and not past its last day). A batch that waits is the notice's.
 */
function runsToday(row: Pick<SequenceRowDto, "first">, at: { tz: string; nowMs: number }): boolean {
  return !!row.first && campaignRunsOn(row.first, { tz: at.tz, now: new Date(at.nowMs) });
}

/**
 * Every act of a sequence's head (decision 0072), never offering what its door refuses on the facts the record carries:
 *
 * - Start a draft, never a one-off (it opens in New) or one with an email still to write (its dock asks for it first);
 *   Pause one that is on, Turn on one that is paused, neither a one-off (its batch decides it).
 * - End it a customer's sequence that has run, on or paused; one that never ran is discarded instead, the same going (its
 *   first step's trigger takes it away whole), and a sequence to leads is paused, never ended (its door refuses it).
 * - Discard a customer's sequence that never made a batch, in any state, or a one-off kept as a draft (sequence_discard's
 *   rule), and a sequence to leads that never wrote (reach_out_remove's); one whose past could not be read, none.
 * - Run now as a moment's or a list's first step runs on the business's day, with no batch waiting for an OK.
 * - Rename any but a one-off and one that ended; Cancel this send a one-off waiting for its day (the run's cancel door,
 *   asked first), never one already going (it would reach some of its people and not others), and one waiting for an OK
 *   is skipped from its notice; Send it again a one-off that went. No door moves a one-off to another day or other
 *   people: it is cancelled and made again.
 *
 * What the record cannot carry stays its door's to refuse at the press, in the door's words: a twin on a visit moment, an
 * archived list, and Run now's refusals on the edge.
 */
export function sequenceActsOf(rec: SequenceActsInput, at: { tz: string; nowMs: number }): SequenceActs {
  const row = rec.sequence;
  const draft = row.state === "draft";
  // A one-off's acts are its batch's and its day's; every other act below is a sequence's that runs on.
  if (row.starts === "date")
    return {
      start: no("one_off"),
      pause: no("one_off"),
      turn_on: no("one_off"),
      end: no("one_off"),
      discard: draft && row.once ? OK : no("one_off"),
      run_now: no("one_off"),
      rename: no("one_off"),
      cancel_send: row.date?.state === "scheduled" ? OK : no("not_scheduled"),
      send_again: row.last ? OK : no("not_sent"),
    };
  const leads = row.starts === "leads";
  const notOnce = no("not_a_one_off");
  if (row.state === "ended") {
    const ended = no("ended");
    return {
      start: ended,
      pause: ended,
      turn_on: ended,
      end: ended,
      discard: ended,
      run_now: ended,
      rename: ended,
      cancel_send: notOnce,
      send_again: notOnce,
    };
  }
  // A draft never ran (its first step never did), so its past needs no read; past a draft, the read says (absent: unread).
  const ran = draft ? false : rec.ran;
  const wrote = draft ? false : rec.wrote;
  const discard = leads
    ? wrote === undefined
      ? no("unread")
      : wrote
        ? no("wrote", "pause")
        : OK
    : ran === undefined
      ? no("unread")
      : ran
        ? no("ran", "end")
        : OK;
  return {
    start: !draft
      ? no("not_a_draft", row.state === "paused" ? "turn_on" : undefined)
      : leadDraftDockOf(row, rec.chain)
        ? no("email_to_write")
        : OK,
    pause: row.state === "on" ? OK : no("not_on"),
    turn_on: row.state === "paused" ? OK : no("not_paused", draft ? "start" : undefined),
    // One that never ran goes whole either way (its first step's trigger): it is offered as Discard, not End.
    end: leads ? no("to_leads", "pause") : ran === false ? no("never_ran", "discard") : OK,
    discard,
    run_now: leads
      ? no("to_leads")
      : row.first && triggerOf(row.first.trigger)?.kind === "freed"
        ? no("freed_time")
        : row.needs.waiting > 0
          ? no("batch_waiting")
          : runsToday(row, at)
            ? OK
            : no("not_today"),
    rename: OK,
    cancel_send: notOnce,
    send_again: notOnce,
  };
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
