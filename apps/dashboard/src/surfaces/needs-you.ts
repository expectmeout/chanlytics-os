/**
 * What needs you, counted once for everything that says it (decision 0048, point 1; the wiring blueprint's OW1).
 *
 * The Inbox's badge in the sidebar, the phone's Inbox tab, the title of the browser's tab, the phone app's badge and Today's
 * head each showed the number the last `inbox:counts` event carried, and two pages sent it: Today after each of its reads,
 * the Inbox whenever its own number changed. They counted a reply the owner had just held differently for the seconds before
 * the cancel's re-read, and whichever sent last was on screen. The Needs-you tab beside Conversations counted again off the
 * Inbox's rows, and the shell started from a copy of the same filter.
 *
 * They all read this now: a selector over the Inbox's threads, which hold every hold and every held send and the one thing
 * only the Inbox knows (a reply this tab has just held), and over the runs the campaigns surface holds that wait for a word.
 * It sends nothing and keeps nothing: the surfaces it is made of move, and a reader that asks again is told the same thing.
 * The sum is contracts' (waits.ts `needsYouCount`), and a thread's part in it is `threadWait`, which the Inbox's chip and
 * Today's headline ask too.
 */
import { useSyncExternalStore } from "react";
import { needsYouCount, waitsOf, type WaitingThread } from "@chanlytics/contracts";
import { onSurfaceMoved } from "@/legacy-bridge/surface-status";
import { ixWaiting, ixWaitsOnYou } from "./inbox/rules";
import { demoSession } from "./inbox/shell";
import { IX_STORE, inboxData } from "./inbox/store";
import type { Thread } from "./inbox/types";
import { surfaceValue } from "./surface-values";

/**
 * A thread as the count reads it: a real one by the Inbox's own rule, with the hold this tab has made; a seeded one (a
 * demo session's) by the mockup's, less the decisions the session has made on it.
 */
function waitingThread(t: Thread): WaitingThread {
  return t.real ? ixWaiting(t) : { needsYou: ixWaitsOnYou(t) && !IX_STORE.get(t.id) };
}

/**
 * How many things wait on you now, or null while the Inbox has not been read: a count of what nothing has read is no count,
 * and the seeded threads of the mockup are no one's. A demo session counts its seeds, as the mockup always did. The runs
 * are the campaigns surface's, none until it is read.
 */
export function needsYouNow(nowMs: number = Date.now()): number | null {
  const inbox = typeof window !== "undefined" && demoSession() ? inboxData() : surfaceValue("inbox");
  if (!inbox) return null;
  return needsYouCount(
    waitsOf({
      threads: inbox.THREADS.map(waitingThread),
      runs: surfaceValue("broadcasts")?.rows ?? [],
      nowMs,
    }),
  );
}

const hearers = new Set<() => void>();
let wired = false;

/** Told that something the count is made of has moved: the number may be another one. */
function moved(): void {
  for (const fn of [...hearers]) fn();
}

/**
 * Hear the count's sources move (the Inbox's threads, the campaigns' runs, and what only the Inbox's page knows:
 * `needsYouMoved`); ask `needsYouNow` again when told. Told on a move, not on a change of the number, so a reader keeps what
 * it last drew until it compares. Answers the stop.
 */
export function hearNeedsYou(fn: () => void): () => void {
  if (!wired) {
    wired = true;
    onSurfaceMoved(["inbox", "broadcasts"], moved);
    // A demo session's decisions are the session's, not a read's: the store says so with this one event (inbox/store.ts).
    if (typeof window !== "undefined" && demoSession()) window.addEventListener("inbox:decisions", moved);
  }
  hearers.add(fn);
  return () => void hearers.delete(fn);
}

/**
 * The Inbox's page tells the readers that what only it holds has moved: a reply held in this tab, which no read has told the
 * wire of yet, and a decision on a demo's seeded thread. Nothing else sends it.
 */
export function needsYouMoved(): void {
  moved();
}

/**
 * The count, as a hook: drawn again when the number changes, and by nothing else. The shell's pages that have not moved read
 * it by name (`window.useNeedsYou`, published from seed-globals); a surface imports it.
 */
export function useNeedsYou(): number | null {
  return useSyncExternalStore(hearNeedsYou, needsYouNow, needsYouNow);
}
