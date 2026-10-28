/**
 * The Inbox's rules, said once (moved from pages/inbox.jsx and pages/thread-pane.jsx, decision 0015, step 3): what waits
 * on you, the bucket a thread sits in, the order a bucket stands in, a draft's own key in the veto store, and the
 * thread a route names. The pages read them, and so does the selector the sidebar's badge, the strip's tab, the title and the
 * phone read (needs-you.ts, through `ixWaiting`), so no two of them can say different numbers; the standalone mockup gets
 * `ixWaitsOnYou` from legacy-globals.ts.
 */
import { replyWaitsOnYou, threadWait, type WaitingThread } from "@chanlytics/contracts";
import { VW_STORE, type VetoState } from "./store";
import type { RealThread, Thread, ThreadState } from "./types";

// ---- A draft counting down, by its own record ----

/**
 * A draft's own record in the veto store: a hold belongs to the draft it held. Kept against the thread, the next
 * draft on that thread read "Held — manual send" while the server sent it (I3). A seeded draft keeps the thread's.
 */
export const ixDraftKey = (t: Thread): string =>
  t.real && t.veto && t.veto.messageId ? `draft:${t.veto.messageId}` : t.id;

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
 * A reply counting down to auto-send waits on you for those seconds: you can still stop it, and after them it is in
 * your name. ONE rule for the Needs you chip, the bucket a row sits in, the order it sits in, this page's count and
 * the sidebar badge, so no two of them can say different numbers. Such a thread sat in Handled with nothing on its
 * row, and the countdown showed only in the pane you had to open first.
 * The rule is contracts' (standing.ts replyWaitsOnYou), People's Needs you too.
 */
export const ixSending = (t: Thread | null | undefined, nowMs: number = Date.now()): boolean =>
  !!(t && t.real && t.veto && replyWaitsOnYou({ endsAtMs: t.veto.endsAtMs, held: ixHeld(VW_STORE.state, t) }, nowMs));

/**
 * A real thread as contracts' count reads it (waits.ts WaitingThread): the answer its view model carries, and the reply
 * counting down with whether THIS tab has held it, the one thing only a tab knows. The Inbox's chip and list, and the badge
 * (needs-you.ts), ask contracts' `threadWait` of this, so none of them can count a thread the others do not.
 */
export const ixWaiting = (t: RealThread): WaitingThread => ({
  needsYou: !!t.needsYou,
  send:
    t.veto && typeof t.veto.endsAtMs === "number"
      ? { endsAtMs: t.veto.endsAtMs, held: ixHeld(VW_STORE.state, t) }
      : null,
});

/**
 * What waits on you now: a real thread nobody has taken, or a reply about to send. A seeded thread keeps the
 * mockup's rule, since "needs" is a state no real thread holds. The same two facts read off the wire, for a page that
 * holds the conversations and not these rows, are contracts' `conversationWaitsOnYou` (Today's headline): the two are one
 * rule (waits.ts threadWait), and inbox-counts.test.mjs holds them to it.
 */
export const ixWaitsOnYou = (t: Thread | null | undefined, nowMs: number = Date.now()): boolean =>
  t && t.real
    ? threadWait(ixWaiting(t), nowMs) !== null
    : !!t && (t.state === "needs" || (t.state === "escalated" && !t.takenOver));

/**
 * The bucket a thread SITS in -- the same rule as the chip over it, which is what the line above this block has
 * claimed all along. A thread's own STATE stays "escalated" while a teammate holds it, and the list read the state
 * while the chip read what waits on you: three rows under a chip that said two, and one of them somebody else's
 * job. Needs you holds what waits on you and nothing else; a thread a teammate has taken is Handled, where its row
 * still says who has it.
 */
export const ixBucketOf = (t: Thread | null | undefined, nowMs: number = Date.now()): ThreadState | null | undefined =>
  ixSending(t, nowMs)
    ? "escalated"
    : t && t.real && t.state === "escalated" && !ixWaitsOnYou(t, nowMs)
      ? "done"
      : t && t.state;

/**
 * The order a bucket stands in: a reply about to send first, then what needs you, then the threads you have, then a
 * teammate's, each group in the server's order. A teammate's thread sat above the one waiting on you (I2).
 */
export const ixRank = (t: Thread): number =>
  ixSending(t) ? -1 : t && t.real && t.state === "escalated" ? (t.needsYou ? 0 : t.takenOver ? 1 : 2) : 0;

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
  for (const s of ["escalated", "needs", "snoozed", "done"]) {
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
  if (t)
    return typeof had === "string" && had && (had === "all" || ixBucketOf(t) === had) ? had : (ixBucketOf(t) ?? "");
  return typeof had === "string" && had ? had : ixFirstBucket(threads, at.runsWaiting);
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
