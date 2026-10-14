/**
 * What waits on a person, counted once (decision 0048, point 1).
 *
 * Three things wait on the owner. A hold is a thread that needs a person and nobody has taken: not snoozed, not a
 * teammate's, and never a customer's STOP, which is news and no wait (escalations.ts waitsOnAPerson). A held send is the
 * receptionist's reply counting down to go in the owner's name, which can still be stopped (standing.ts replyWaitsOnYou).
 * A run is a campaign waiting for a word before anything sends, while a word can still send it: a playbook's run whose
 * day has passed can only be skipped (runApprovalRefusal, which the verb refuses by), and the hourly sweep skips it
 * itself, so it waits on nobody (the wiring's second audit, S7-3). A reach-out's going run whose emails the check holds
 * waits too, once however many it holds: those emails go nowhere until the owner says (Ruben, 13 Oct 2026). So does one
 * whose emails are handed to its owner to send from their own inbox (00428): they go nowhere until the owner sends them.
 *
 * The Inbox's badge in the sidebar, the phone's Inbox tab, the title of the browser's tab, the phone app's badge and
 * Today's head each counted them their own way, and two pages published a number over each other's (the wiring
 * blueprint's OW1). They all say `needsYouCount(waitsOf(...))` now, and the count a thread adds is `threadWait`: the
 * Inbox's own rule, Today's headline and the bell's rows ask the same one. Each page draws its parts too (the Inbox's
 * band for the runs, Today's sub-line for the sends), so no page says "nothing needs you" over a part it counts.
 *
 * Pure: a page hands in the threads and the runs it holds, the business's days and the clock.
 */
import { replyWaitsOnYou } from "../conversations/standing";
import { runApprovalRefusal } from "../playbooks/playbook-approval";
import { RUN_GOING_STATES } from "../broadcasts/broadcasts";

/** One thread as the count reads it, however the page holds the thread: a view model, or a conversation off the wire. */
export interface WaitingThread {
  /** It needs a person and nobody has it (standing "needs_you", threadStanding). */
  needsYou: boolean;
  /** The reply counting down to send, when the thread has one: when it goes, and whether this tab has just held it. */
  send?: { endsAtMs: number; held?: boolean } | null;
}

/** One campaign run as the count reads it: its state, and what the approve verb asks of its day. */
export interface WaitingRun {
  /** The run's state (BROADCAST_STATES): it waits for a word in `pending_approval`. */
  state: string;
  /** The playbook that made it: a one-off broadcast has none, and no day to pass. */
  playbook_id?: string | null;
  /** The business's day the run was made for (a playbook's run). */
  run_for?: string | null;
  audience?: unknown;
  /** How many of a going run's emails the check holds for the owner's say (absent where Sent did not say). */
  held?: number | null;
  /** How many of a going run's emails are handed to its owner to send from their inbox (00428; absent where not said). */
  drafted?: number | null;
}

/** The business's day now and the day of the next open sending moment (contracts runDaysAt): what the verb asks by. */
export interface RunDays {
  today: string;
  sendsOn: string;
}

/** What waits on a person, by what it is. A thread is one wait: a hold wins over a send. */
export interface Waits {
  /** Threads that need a person and nobody has them, and open holds whose thread could not be read (unknown is not handled). */
  holds: number;
  /** Replies counting down that can still be stopped, on threads with no hold of their own. */
  sends: number;
  /** Runs waiting for a word that can still send them, and going runs whose emails the check holds (runWaitsOnYou). */
  runs: number;
}

/**
 * Whether a campaign's run waits for your word: it is waiting for approval, and an approval now would send it (contracts
 * runApprovalRefusal, THE predicate core approveRun refuses by, the reach-out exemption and all), or it is going and its
 * check holds emails for your say (runHeldEmails). A one-off broadcast has no day to pass and waits until it is decided.
 */
export function runWaitsOnYou(run: WaitingRun, days: RunDays): boolean {
  if (runHeldEmails(run) > 0 || runDraftedEmails(run) > 0) return true;
  return run.state === "pending_approval" && runApprovalRefusal(runAsked(run), days) === null;
}

/** How many emails a going run's check holds for your say: none for a run that is not going, or where Sent did not say. */
export function runHeldEmails(run: Pick<WaitingRun, "state" | "held">): number {
  const going = (RUN_GOING_STATES as readonly string[]).includes(run.state);
  return going && typeof run.held === "number" && run.held > 0 ? run.held : 0;
}

/** How many of a going run's emails wait for its owner to send them from their inbox (00428): none for a run not going. */
export function runDraftedEmails(run: Pick<WaitingRun, "state" | "drafted">): number {
  const going = (RUN_GOING_STATES as readonly string[]).includes(run.state);
  return going && typeof run.drafted === "number" && run.drafted > 0 ? run.drafted : 0;
}

/** Whether a run waits for approval that an approval can no longer send: it can only be skipped, and the sweep skips it. */
export function runTooLate(run: WaitingRun, days: RunDays): boolean {
  return run.state === "pending_approval" && runApprovalRefusal(runAsked(run), days) !== null;
}

/** The runs that wait for your word, of those a page holds. */
export function runsThatWait<R extends WaitingRun>(runs: readonly R[], days: RunDays): R[] {
  return runs.filter((r) => runWaitsOnYou(r, days));
}

const runAsked = (run: WaitingRun) => ({
  playbook_id: run.playbook_id ?? null,
  run_for: run.run_for ?? null,
  audience: run.audience,
});

/**
 * How a thread waits on the owner now, or not at all: a hold nobody has taken, else a reply that can still be stopped. A
 * reply this tab has held is stopped, so it does not wait; a reply past its deadline is going out in the owner's name.
 */
export function threadWait(t: WaitingThread, nowMs: number): "hold" | "send" | null {
  if (t.needsYou) return "hold";
  return t.send && replyWaitsOnYou({ endsAtMs: t.send.endsAtMs, held: t.send.held }, nowMs) ? "send" : null;
}

/**
 * The threads' part of what waits: their holds and held sends, and the holds whose thread the page could not read
 * (`unreadHolds`, each one a customer who may be waiting). Required, so no page forgets the threads it failed to read.
 */
export function threadWaits(input: {
  threads: readonly WaitingThread[];
  unreadHolds: number;
  nowMs: number;
}): Pick<Waits, "holds" | "sends"> {
  let holds = input.unreadHolds;
  let sends = 0;
  for (const t of input.threads) {
    const wait = threadWait(t, input.nowMs);
    if (wait === "hold") holds += 1;
    else if (wait === "send") sends += 1;
  }
  return { holds, sends };
}

/**
 * Everything that waits on a person, counted: the threads' holds and held sends (threadWaits), and the runs waiting for
 * a word that can still send them (runWaitsOnYou), asked by the business's days.
 */
export function waitsOf(input: {
  threads: readonly WaitingThread[];
  unreadHolds: number;
  runs: readonly WaitingRun[];
  days: RunDays;
  nowMs: number;
}): Waits {
  return { ...threadWaits(input), runs: runsThatWait(input.runs, input.days).length };
}

/** The one number every surface shows for "needs you": the badge, the tab, the title, the phone and Today's head. */
export function needsYouCount(waits: Waits): number {
  return waits.holds + waits.sends + waits.runs;
}
