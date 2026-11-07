/**
 * The Inbox's rules, said once (moved from pages/inbox.jsx and pages/thread-pane.jsx, decision 0015, step 3): what waits
 * on you, the bucket a thread sits in, the order a bucket stands in, a draft's own key in the veto store, and the
 * thread a route names. The pages read them, and so does needs-you.ts for the parts it says apart (through `ixWaiting`):
 * the Inbox's band and head, and Ask's Right now, so no two of them can say different numbers (the badge's one count is
 * Today's rows above To do, 0048 amended 2 Nov 2026); the standalone mockup gets `ixWaitsOnYou` from mockup-globals.ts.
 */
import {
  HOUR_MS,
  moveWaits,
  threadMoveNow,
  threadWait,
  waitedSaid,
  waitedSince,
  type ThreadList,
  type ThreadMove,
  type WaitingThread,
} from "@chanlytics/contracts";
import { VW_STORE, type VetoState } from "./store";
import type { RealThread, Thread, ThreadState } from "./types";

// ---- A draft counting down, by its own record ----

/** A real draft's record in the veto store, by the message it is: what the Inbox holds it under, and Today reads. */
export const vetoKeyOf = (messageId: string): string => `draft:${messageId}`;

/**
 * A draft's own record in the veto store: a hold belongs to the draft it held. Kept against the thread, the next
 * draft on that thread read "Held — manual send" while the server sent it (I3). A seeded draft keeps the thread's.
 */
export const ixDraftKey = (t: Thread): string =>
  t.real && t.veto && t.veto.messageId ? vetoKeyOf(t.veto.messageId) : t.id;

export const ixHeld = (state: Record<string, VetoState>, t: Thread): boolean => !!state[ixDraftKey(t)]?.held;

// Past a real draft's deadline the only honest move is to go and look -- and to look again while the draft is still
// there: the job fires on a ten-second tick, and one read at zero left "Auto-sends in 0s" until something else moved (I3).
// Since 00327 the send itself reaches the tab (a message's update, heard by status), so these looks are the fallback for
// a feed that is down: one per job tick, three of them, where six five seconds apart re-read the whole Inbox each time.
const IX_READ_AGAIN_MS = 10_000;
const IX_READ_AGAIN_TRIES = 3;

export const ixReadAgain = (st: VetoState, nowMs: number): boolean => {
  if ((st.tries || 0) >= IX_READ_AGAIN_TRIES || (st.lastTry != null && nowMs - st.lastTry < IX_READ_AGAIN_MS))
    return false;
  st.tries = (st.tries || 0) + 1;
  st.lastTry = nowMs;
  return true;
};

// ---- What waits on you, and where a thread sits ----

/**
 * Who owes the next move on a real thread at this moment (contracts thread-move.ts): the answer its read carried, its
 * clock run on, with the one thing only a tab knows, a reply held in it. The head, the row, the tab and the count all ask
 * this, so no two of them can say different things of one thread.
 */
export const ixMoveOf = (t: RealThread, nowMs: number = Date.now()): ThreadMove =>
  threadMoveNow(t.move, nowMs, ixHeld(VW_STORE.state, t));

/**
 * How long a move has stood, in the one family (8d, 3h, 40m): a hold's wait as its read said it, which a refresh says again by
 * its clock (contracts inboxThreadClock), and any other by the clock it is drawn at. Null where no wait is worth saying.
 */
export const ixMoveWaited = (t: RealThread, move: ThreadMove, nowMs: number = Date.now()): string | null => {
  if (move.sinceMs === undefined) return null;
  return t.waited && move.sinceMs === t.escalatedAtMs ? t.waited : waitedSince(move.sinceMs, nowMs);
};

/** What the bare figure means, on a hover and to a screen reader: someone waiting on you or a teammate, or how long ago ours went. */
export const ixWaitSaid = (move: ThreadMove, waited: string): string =>
  move.list === "escalated" || move.move === "theirs" ? waitedSaid(waited) : `${waited} ago`;

/**
 * When the next thread's clock runs out, within the hour; null with none that soon. A reply being worked out that never comes
 * has no read to say so: the page draws itself again at this moment (inbox-page.tsx useMoveClock).
 */
export const ixNextMoveAt = (threads: readonly Thread[], nowMs: number): number | null => {
  let next: number | null = null;
  for (const t of threads) {
    const at = t.real ? ixMoveOf(t, nowMs).until?.atMs : undefined;
    if (at !== undefined && at - nowMs <= HOUR_MS && (next === null || at < next)) next = at;
  }
  return next;
};

/**
 * A reply counting down to auto-send waits on you for those seconds: you can still stop it, and after them it is in
 * your name. Such a thread sat in Handled with nothing on its row, and the countdown showed only in the pane you had to
 * open first.
 */
export const ixSending = (t: Thread | null | undefined, nowMs: number = Date.now()): boolean =>
  !!(t && t.real && ixMoveOf(t, nowMs).move === "sending");

/**
 * A real thread as contracts' count reads it (waits.ts WaitingThread). The Inbox's chip and list, and the parts
 * needs-you.ts says apart, ask contracts' `threadWait` of this, so none of them can count a thread the others do not.
 */
export const ixWaiting = (t: RealThread, nowMs: number = Date.now()): WaitingThread => moveWaits(ixMoveOf(t, nowMs));

/**
 * What waits on you now: a real thread the rule puts in Needs you, or a reply about to send. A seeded thread keeps the
 * mockup's rule, since "needs" is a state no real thread holds. The same answer read off the wire, for a page that
 * holds the conversations and not these rows, is contracts' `conversationWaitsOnYou` (Today's headline): the two are one
 * rule (waits.ts threadWait), and inbox-counts.test.mjs holds them to it.
 */
export const ixWaitsOnYou = (t: Thread | null | undefined, nowMs: number = Date.now()): boolean =>
  t && t.real
    ? threadWait(ixWaiting(t, nowMs), nowMs) !== null
    : !!t && (t.state === "needs" || (t.state === "escalated" && !t.takenOver));

/**
 * The list a thread SITS in: the rule's (thread-move.ts), the same rule as the chip over it. Needs you holds what is yours
 * to do and nothing else, Waiting what is theirs or a teammate's, Handled what nobody owes; archived is in no list, and
 * search and a link still find it. A seeded thread keeps the state the mockup wrote.
 */
export const ixBucketOf = (
  t: Thread | null | undefined,
  nowMs: number = Date.now(),
): ThreadState | ThreadList | null | undefined => (t && t.real ? ixMoveOf(t, nowMs).list : t && t.state);

/**
 * The order a list stands in: a reply about to send first, then what needs you, each group in the server's order. In
 * Waiting, the threads you have, then a teammate's, then the rest. A teammate's thread sat above the one waiting on you (I2).
 */
export const ixRank = (t: Thread): number => {
  if (!t || !t.real) return 0;
  const m = ixMoveOf(t);
  if (m.move === "sending") return -1;
  if (m.list !== "waiting") return 0;
  return m.move === "yours" ? 1 : m.move === "theirs" ? 2 : 3;
};

/**
 * The thread a route names. The id is passed on even when the Inbox has not loaded that thread: dropping it opened
 * the first thread in the list -- another customer's -- in silence, where the Inbox knows to say it is missing.
 */
export const ixRouteThread = (
  param: string | null | undefined,
  threads: Thread[] | null | undefined,
): { id: string | null; who: string | null } => {
  const id = typeof param === "string" && param ? param : null;
  const found = id ? (threads || []).find((t) => t.id === id) : null;
  return { id, who: found ? found.who : null };
};

// ---- Where the Inbox opens ----

// The phone's width, where the list and the thread take turns on the screen (mobile.css, 720px): a phone's Inbox opens on
// its list alone.
export const ixOnPhone = (): boolean => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);

/** Where the Inbox opens is decided by what this device keeps and what is waiting: the page's, and its read's (surface.ts). */
interface IxOpeningAt {
  /** The bucket the member had (the Inbox's place, place.ts ixPlace), which comes back with a refresh. */
  had: unknown;
  /** Whether a campaign run waits for your say (needs-you.ts waitingRunsNow): a row of Needs you. */
  runsWaiting: boolean;
  toSendOpen?: boolean;
}

// The bucket a thread is IN, never the state it holds: one whose own reply is on its way out is in Needs you. A campaign
// run waiting for your say is a row of Needs you too (inbox-runs.tsx): with one, Needs you is where the Inbox opens, as the
// badge over it says. It opened on Handled, and the run waited unseen under a tab that said no number.
export const ixFirstBucket = (list: Thread[], runsWaiting: boolean): string => {
  if (runsWaiting) return "escalated";
  for (const s of ["escalated", "needs", "waiting", "snoozed", "done"]) {
    if (list.some((x) => ixBucketOf(x) === s)) return s;
  }
  return "escalated";
};

// The bucket the member had comes back with a refresh; a thread the address names opens in it when it lists that thread,
// and in its own bucket when it does not.
export const ixOpeningBucket = (threads: Thread[], initialThreadId: string | null, at: IxOpeningAt): string => {
  // To send's address (`inbox/to-send`) opens Needs you, where its part is (the Campaigns wiring review's lane 4).
  if (at.toSendOpen) return "escalated";
  const t = initialThreadId ? threads.find((x) => x.id === initialThreadId) : undefined;
  const had = at.had;
  const kept = typeof had === "string" && had ? had : null;
  if (t) {
    const own = ixBucketOf(t);
    // An archived thread a link names opens beside the list the member had: no list holds it.
    if (own === "out") return kept ?? "done";
    return kept && (kept === "all" || own === kept) ? kept : (own ?? "");
  }
  return kept ?? ixFirstBucket(threads, at.runsWaiting);
};

/**
 * The thread drawn beside the list as the page first opens, as the page picks it (pages/inbox-page.tsx inboxOnScreen): the
 * one the address names where the Inbox holds it, else the first of the bucket it opens on, in the one order (ixRank). The
 * Inbox's read asks it, to read that thread's person with it (surface.ts).
 */
export function ixOpeningThread(
  threads: Thread[],
  initialThreadId: string | null,
  at: IxOpeningAt,
): Thread | undefined {
  if (initialThreadId) return threads.find((t) => t.id === initialThreadId);
  const bucket = ixOpeningBucket(threads, null, at);
  return threads
    .filter((t) => bucket === "all" || ixBucketOf(t) === bucket)
    .sort((a, b) => ixRank(a) - ixRank(b))
    .at(0);
}

// ---- A bulk act's refusals, in words ----

/** The people a bulk act could not act on, named: no more than three names in a line. */
const ixNames = (whos: string[]): string =>
  whos.length > 3
    ? `${whos.slice(0, 2).join(", ")} and ${whos.length - 2} more`
    : whos.length > 1
      ? `${whos.slice(0, -1).join(", ")} and ${whos[whos.length - 1]}`
      : whos[0] || "";

/** Grouped by the sentence, so twenty refused for one reason read as one line. */
export const ixRefusedWords = (refused: Array<{ thread: { who: string }; message: string }>): string => {
  const by = new Map<string, string[]>();
  for (const r of refused) by.set(r.message, [...(by.get(r.message) || []), r.thread.who]);
  return [...by].map(([message, whos]) => `${ixNames(whos)}: ${message}`).join(" ");
};
