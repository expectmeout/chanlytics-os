/**
 * What waits on a person, counted once (decision 0048, point 1).
 *
 * Three things wait on the owner. A hold is a thread that needs a person and nobody has taken: not snoozed, not a
 * teammate's, and never a customer's STOP, which is news and no wait (escalations.ts waitsOnAPerson). A held send is the
 * receptionist's reply counting down to go in the owner's name, which can still be stopped (standing.ts replyWaitsOnYou).
 * A run is a campaign waiting for a word before anything sends.
 *
 * The Inbox's badge in the sidebar, the phone's Inbox tab, the title of the browser's tab, the phone app's badge and
 * Today's head each counted them their own way, and two pages published a number over each other's (the wiring
 * blueprint's OW1). They all say `needsYouCount(waitsOf(...))` now, and the count a thread adds is `threadWait`: the
 * Inbox's own rule, Today's headline and the bell's rows ask the same one.
 *
 * Pure: a page hands in the threads and the runs it holds, and the clock.
 */
import { replyWaitsOnYou } from "../conversations/standing";

/** One thread as the count reads it, however the page holds the thread: a view model, or a conversation off the wire. */
export interface WaitingThread {
  /** It needs a person and nobody has it (standing "needs_you", threadStanding). */
  needsYou: boolean;
  /** The reply counting down to send, when the thread has one: when it goes, and whether this tab has just held it. */
  send?: { endsAtMs: number; held?: boolean } | null;
}

/** One campaign run as the count reads it. */
interface WaitingRun {
  /** The run's state (BROADCAST_STATES): it waits for a word in `pending_approval`. */
  state: string;
}

/** What waits on a person, by what it is. A thread is one wait: a hold wins over a send. */
interface Waits {
  /** Threads that need a person and nobody has them, and open holds whose thread could not be read (unknown is not handled). */
  holds: number;
  /** Replies counting down that can still be stopped, on threads with no hold of their own. */
  sends: number;
  /** Runs waiting for a word. */
  runs: number;
}

/** Whether a campaign's run waits for a word before it sends. */
const runWaitsOnYou = (run: WaitingRun): boolean => run.state === "pending_approval";

/**
 * How a thread waits on the owner now, or not at all: a hold nobody has taken, else a reply that can still be stopped. A
 * reply this tab has held is stopped, so it does not wait; a reply past its deadline is going out in the owner's name.
 */
export function threadWait(t: WaitingThread, nowMs: number): "hold" | "send" | null {
  if (t.needsYou) return "hold";
  return t.send && replyWaitsOnYou({ endsAtMs: t.send.endsAtMs, held: t.send.held }, nowMs) ? "send" : null;
}

/**
 * Everything that waits on a person, counted: the threads' holds and held sends, the runs waiting for a word, and the
 * holds whose thread the page could not read (`unreadHolds`, each one a customer who may be waiting).
 */
export function waitsOf(input: {
  threads: readonly WaitingThread[];
  runs: readonly WaitingRun[];
  unreadHolds?: number;
  nowMs: number;
}): Waits {
  let holds = input.unreadHolds ?? 0;
  let sends = 0;
  for (const t of input.threads) {
    const wait = threadWait(t, input.nowMs);
    if (wait === "hold") holds += 1;
    else if (wait === "send") sends += 1;
  }
  return { holds, sends, runs: input.runs.filter(runWaitsOnYou).length };
}

/** The one number every surface shows for "needs you": the badge, the tab, the title, the phone and Today's head. */
export function needsYouCount(waits: Waits): number {
  return waits.holds + waits.sends + waits.runs;
}
