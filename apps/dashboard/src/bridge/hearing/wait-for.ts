/**
 * Waiting on work outside the page: an Ask turn writing the morning, an opening being checked, Stripe's answer, a number
 * on its way, a call (the page-open PRD of 3 Nov 2026, L2). Such work tells the live feed nothing, or tells it in a table
 * the page does not hear, so the page asks again until what it waits for has come. Four pages did it four ways: an 8 s
 * timer, a 15 s one, a 6 s one that paused while hidden, and one that called a surface's `apply` around the runner, which
 * skipped its status, its snapshot and the sign-out a 401 asks for.
 *
 * Now one pace serves them. It asks `read` (a surface's read goes through the runner: refreshSurfaces), never while the
 * page is hidden (it asks once as the page comes back in front), slower each time it finds nothing new (×1.5 up to
 * `ceilingMs`), and stops when `until` says the wait is over or at `maxMs`, whichever comes first. A read under way is
 * never asked twice.
 */
import { MIN_MS } from "@chanlytics/contracts";

export interface WaitPace {
  /** Ask again: a surface's read through the runner (refreshSurfaces), or a read the page holds itself. */
  read: () => unknown;
  /** The first wait between two asks. */
  everyMs: number;
  /** The longest wait between two asks: each ask after the first waits half as long again, to this. */
  ceilingMs?: number;
  /** When to stop asking, from the first: the work is late, and the page says what it says of a wait that ran out. */
  maxMs?: number;
  /** Whether what was waited for has come: checked before each ask. */
  until?: () => boolean;
}

/** What the pace reads of the world: the clock, the timer and whether the page is in front. A test's are its own. */
export interface WaitWorld {
  now: () => number;
  later: (fn: () => void, ms: number) => () => void;
  hidden: () => boolean;
  /** Called with a listener for the page coming back in front; answers how to stop listening. */
  onShown: (fn: () => void) => () => void;
}

/** The slowest a wait goes between two asks, unless the page says its own. */
const CEILING_MS = MIN_MS;
/** How long a wait goes on, unless the page says its own: past it the work is late, not on its way. */
const LONGEST_MS = 10 * MIN_MS;
/** Each ask after the first waits this much longer than the last. */
const SLOWER = 1.5;

const browserWorld = (): WaitWorld => ({
  now: () => Date.now(),
  later: (fn, ms) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
  hidden: () => typeof document !== "undefined" && document.visibilityState === "hidden",
  onShown: (fn) => {
    if (typeof document === "undefined") return () => {};
    const heard = () => {
      if (document.visibilityState === "visible") fn();
    };
    document.addEventListener("visibilitychange", heard);
    return () => document.removeEventListener("visibilitychange", heard);
  },
});

/** Start waiting: answers the stop, which the page calls as the wait leaves its screen. */
export function waitFor(pace: WaitPace, world: WaitWorld = browserWorld()): () => void {
  const began = world.now();
  const ceiling = Math.max(pace.everyMs, pace.ceilingMs ?? CEILING_MS);
  const longest = pace.maxMs ?? LONGEST_MS;
  let wait = pace.everyMs;
  let stopped = false;
  let reading = false;
  let missedWhileHidden = false;
  let cancelTimer: () => void = () => {};

  const over = (): boolean => stopped || world.now() - began >= longest || (pace.until?.() ?? false);

  const ask = async (): Promise<void> => {
    if (over()) return stop();
    if (world.hidden()) {
      missedWhileHidden = true;
      return;
    }
    if (reading) return schedule();
    reading = true;
    try {
      await pace.read();
    } catch {
      // A read that failed is the runner's to say (the status line); the wait goes on at its pace.
    } finally {
      reading = false;
    }
    schedule();
  };

  const schedule = (): void => {
    if (over()) return stop();
    cancelTimer = world.later(() => void ask(), wait);
    wait = Math.min(ceiling, Math.round(wait * SLOWER));
  };

  const unhearShown = world.onShown(() => {
    if (!missedWhileHidden || stopped) return;
    missedWhileHidden = false;
    cancelTimer();
    void ask();
  });

  function stop(): void {
    if (stopped) return;
    stopped = true;
    cancelTimer();
    unhearShown();
  }

  schedule();
  return stop;
}
