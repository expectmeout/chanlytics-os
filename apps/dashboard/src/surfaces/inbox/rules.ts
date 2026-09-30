/**
 * The Inbox's rules, said once (moved from pages/inbox.jsx and pages/thread-pane.jsx, decision 0015, step 3): what waits
 * on you, the bucket a thread sits in, the order a bucket stands in, a draft's own key in the veto store, and the
 * thread a route names. The sidebar's badge, the surface tabs and the pages read them, so no two of them can say
 * different numbers; the shell that has not moved gets `ixWaitsOnYou` from legacy-globals.ts.
 */
import { replyWaitsOnYou } from "@chanlytics/contracts";
import { VW_STORE, type VetoState } from "./store";
import type { Thread, ThreadState } from "./types";

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
const IX_READ_AGAIN_MS = 5000;
const IX_READ_AGAIN_TRIES = 6;

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
 * What waits on you now: a real thread nobody has taken, or a reply about to send. A seeded thread keeps the
 * mockup's rule, since "needs" is a state no real thread holds.
 */
export const ixWaitsOnYou = (t: Thread | null | undefined, nowMs: number = Date.now()): boolean =>
  t && t.real
    ? !!t.needsYou || ixSending(t, nowMs)
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
