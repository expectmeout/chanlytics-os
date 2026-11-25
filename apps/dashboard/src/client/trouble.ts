/**
 * A tab whose reads fail stops asking, and looks once in a while (25 Nov 2026).
 *
 * A read that failed was each surface's own to ask again: 0.8 s later at the boot, then 2 s and 10 s later, on every
 * surface at once, and again from the top at every return to the tab, every rejoin of the live feed and every page that
 * polls. On the night of 24 Nov 2026 the database was failing because it was asked too much, and every open tab answered
 * each failure by asking again: pages that could not settle were held open 30 to 48 s, retrying. A tab asks about
 * twenty-five reads a pass, and none of them knew of the others.
 *
 * Now the tab's one client knows (client/api.ts). Reads failing on several addresses in a row, with none answered between,
 * mean the server is not answering this tab, and from there:
 *
 *  - A read is answered here, with how long is left, and never leaves: every surface's own retry is then a retry of
 *    nothing, and each waits out the time it was told (surface-runner.ts retryLater).
 *  - Once the wait is over, one read leaves to look (the next one asked for, or the runner's own once the wait is due).
 *    Reads asked for while it is out wait for what it says. Answered, the tab is as it was; failed, the wait doubles: 5 s,
 *    then 10, 20, 40 and on to five minutes, each a little longer by chance so tabs do not look as one. A wait the server
 *    names (`Retry-After`) is kept where it is longer.
 *  - Once a look is answered, reads leave a few at a time for a while: every surface held back would otherwise ask in the
 *    same instant, in every tab, of a database that has just come back.
 *
 * A person's own press (the shell's Retry, the network coming back) ends the wait at once: the next read is the look. A
 * write is never held: it is somebody's act, and its answer says the server answers.
 *
 * One failing read is not trouble (a route with a fault of its own): it takes several addresses failing with nothing
 * answered between. Pure: the clock, the chance and the timer are handed in, so it runs under node.
 */
import { MIN_MS, SECOND_MS } from "@chanlytics/contracts";

/** This many reads failed in a row, on at least PATHS_AT addresses, and the server is not answering this tab. */
const FAULTS_AT = 3;
const PATHS_AT = 2;
/** The first wait before the tab looks again; doubled at each look that fails, to WAIT_MAX_MS. */
const WAIT_FIRST_MS = 5 * SECOND_MS;
const WAIT_MAX_MS = 5 * MIN_MS;
/** How much longer a wait may be by chance, as a share of itself. */
const WAIT_SPREAD = 0.25;
/** Once a look is answered, reads leave this many at a time, for this long. */
const MENDING_LANES = 2;
const MENDING_MS = 10 * SECOND_MS;

/**
 * What a read came to, for the tab's standing: the server answered (whatever it said), it did not, or the read's own
 * caller called it off, which says nothing of the server.
 */
export type ReadVerdict = "answered" | "fault" | "called_off";

/** A read let through: it says what it came to as it settles, with the wait the server named, if it named one. */
export interface ReadLeaves {
  held: null;
  settled(verdict: ReadVerdict, address: string, namedWaitS?: number | null): void;
}
/** A read answered here: the server is not answering, and this is how long is left, in seconds. */
export interface ReadHeld {
  held: number;
}

export interface Trouble {
  /**
   * Asked before a read leaves: whether it leaves or is answered here. Said at once where the tab stands or holds, so a
   * read leaves in the turn it was asked in, as it always did; a promise only while a look is out or the tab mends.
   */
  before(): ReadLeaves | ReadHeld | Promise<ReadLeaves | ReadHeld>;
  /** A write, or any answer outside a read: the server answered, so the tab is as it was. */
  answered(): void;
  /** A person asked: the wait ends now, and the next read is the look. */
  lookNow(): void;
  /** Whether reads are being held. */
  waiting(): boolean;
  /** Hear the wait come due (the runner's read then looks), and the tab mend; answers the stop. */
  onDue(fn: () => void): () => void;
}

interface TroubleDeps {
  now?: () => number;
  chance?: () => number;
  /** Sets a timer and answers its stop: the browser's by default. */
  after?: (ms: number, fn: () => void) => () => void;
}

const browserTimer = (ms: number, fn: () => void): (() => void) => {
  const timer = setTimeout(fn, ms);
  // A test's process is not kept alive by a wait alone (a browser's timer is a number, with nothing to let go of).
  const handle: unknown = timer;
  if (typeof handle === "object" && handle !== null && "unref" in handle) (handle as { unref: () => void }).unref();
  return () => clearTimeout(timer);
};

export function troubleOf(deps: TroubleDeps = {}): Trouble {
  const now = deps.now ?? (() => Date.now());
  const chance = deps.chance ?? Math.random;
  const after = deps.after ?? browserTimer;

  /** Faults in a row and the addresses they were on, while the tab stands. */
  let faults = 0;
  const addresses = new Set<string>();
  /** While reads are held: when the wait ends, and how long it was before chance. */
  let until: number | null = null;
  let waitMs = WAIT_FIRST_MS;
  /** While a look is out: settles true where it was answered. */
  let look: { said: Promise<boolean>; say: (answered: boolean) => void } | null = null;
  let stopDue: (() => void) | null = null;
  const dueListeners = new Set<() => void>();
  /** While the tab mends: until when, how many reads are out, and the ones waiting their turn. */
  let mendingUntil = 0;
  let out = 0;
  const turns: Array<() => void> = [];

  const stand = () => {
    faults = 0;
    addresses.clear();
    until = null;
    waitMs = WAIT_FIRST_MS;
    stopDue?.();
    stopDue = null;
  };
  const hold = (namedWaitS: number | null | undefined) => {
    const ours = waitMs * (1 + chance() * WAIT_SPREAD);
    const wait = Math.max(ours, (namedWaitS ?? 0) * SECOND_MS);
    until = now() + wait;
    stopDue?.();
    stopDue = after(wait, () => {
      stopDue = null;
      for (const fn of [...dueListeners]) fn();
    });
  };
  const leftS = (): number => Math.max(1, Math.ceil(((until ?? now()) - now()) / SECOND_MS));

  /** A read's turn while the tab mends, once a lane is free: answers the hand that gives the lane back. */
  const takeTurn = async (): Promise<() => void> => {
    if (out >= MENDING_LANES) await new Promise<void>((free) => turns.push(free));
    out += 1;
    return () => {
      out -= 1;
      turns.shift()?.();
    };
  };

  const settledAs =
    (done: () => void): ReadLeaves["settled"] =>
    (verdict, address, namedWaitS) => {
      done();
      if (verdict === "called_off") return;
      if (verdict === "answered") {
        // The server answers: whatever was counted, or held, is over.
        if (until !== null && !look) mendingUntil = now() + MENDING_MS;
        if (!look) stand();
        else {
          faults = 0;
          addresses.clear();
        }
        return;
      }
      if (until !== null) return; // already held: a read that left before the hold says nothing new
      faults += 1;
      addresses.add(address);
      if (faults >= FAULTS_AT && addresses.size >= PATHS_AT) hold(namedWaitS);
    };

  const lookSettled =
    (say: (answered: boolean) => void): ReadLeaves["settled"] =>
    (verdict, _address, namedWaitS) => {
      look = null;
      if (verdict === "answered") {
        stand();
        mendingUntil = now() + MENDING_MS;
      } else if (verdict === "fault") {
        waitMs = Math.min(waitMs * 2, WAIT_MAX_MS);
        hold(namedWaitS);
      }
      // Called off, the wait stays over: the next read asked for is the look.
      say(verdict === "answered");
    };

  /** The look: the one read that leaves once the wait is over. */
  const sendLook = (): ReadLeaves => {
    let say: (answered: boolean) => void = () => {};
    const said = new Promise<boolean>((resolve) => (say = resolve));
    look = { said, say };
    return { held: null, settled: lookSettled(say) };
  };

  const before = (): ReturnType<Trouble["before"]> => {
    // A look is out: what it says is this read's answer too.
    if (look) return look.said.then((answered) => (answered ? before() : { held: leftS() }));
    if (until !== null) return now() < until ? { held: leftS() } : sendLook();
    if (now() >= mendingUntil) return { held: null, settled: settledAs(() => {}) };
    return takeTurn().then((done) => ({ held: null, settled: settledAs(done) }));
  };

  return {
    before,
    answered() {
      if (look) return; // the look's own answer decides
      if (until !== null) mendingUntil = now() + MENDING_MS;
      stand();
    },
    lookNow() {
      if (until === null || look) return;
      until = now();
      stopDue?.();
      stopDue = null;
    },
    waiting: () => until !== null,
    onDue(fn) {
      dueListeners.add(fn);
      return () => dueListeners.delete(fn);
    },
  };
}
