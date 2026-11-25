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
 *  - Once the wait is over, a few reads leave to look: the first asked for, and up to two more of addresses that have
 *    not failed since the trouble began. Reads asked for while they are out wait for what they say. One answered, and
 *    the tab is as it was; all failed, and the wait doubles: 5 s, then 10, 20, 40 and on to five minutes, each a little
 *    longer by chance so tabs do not look as one. A wait the server names (`Retry-After`) is kept where it is longer.
 *  - Once a look is answered, reads leave a few at a time for a while: every surface held back would otherwise ask in the
 *    same instant, in every tab, of a database that has just come back.
 *
 * Why more than one read looks: two reads broken by a fault of their own (a route's bug, not the server's) trip the
 * hold as an outage does, and a tab that then looked through one of them alone would hold every healthy read back for
 * as long as the page stayed open. A read of an address that has not failed is the witness that ends it at once, so a
 * couple of those leave during each wait too, without waiting for its end: a press that opens another page is answered
 * by the server where the server answers.
 *
 * A person's own press (the shell's Retry, the network coming back) ends the wait at once: the next reads look. A write
 * is never held: it is somebody's act, and its answer says the server answers.
 *
 * One failing read is not trouble (a route with a fault of its own): it takes several addresses failing with nothing
 * answered between. Pure: the clock, the chance and the timer are handed in, so it runs under node.
 */
import { MIN_MS, SECOND_MS } from "@chanlytics/contracts";

/** This many reads failed in a row, on at least ADDRESSES_AT addresses, and the server is not answering this tab. */
const FAULTS_AT = 3;
const ADDRESSES_AT = 2;
/** The first wait before the tab looks again; doubled at each round of looks that fails, to WAIT_MAX_MS. */
const WAIT_FIRST_MS = 5 * SECOND_MS;
const WAIT_MAX_MS = 5 * MIN_MS;
/** How much longer a wait may be by chance, as a share of itself. */
const WAIT_SPREAD = 0.25;
/** How many reads look once a wait is over: the first asked, and the rest of addresses that have not failed. */
const LOOKS_A_ROUND = 3;
/** How many reads of addresses that have not failed may leave during one wait, before its end: the witnesses. */
const WITNESSES_A_WAIT = 2;
/** Once a look is answered, reads leave this many at a time, for this long. */
const MENDING_LANES = 2;
const MENDING_MS = 10 * SECOND_MS;

/**
 * What a read came to, for the tab's standing: the server answered (whatever it said), it did not, or the read's own
 * caller called it off, which says nothing of the server.
 */
export type ReadVerdict = "answered" | "fault" | "called_off";

/** A read let through: it says what it came to as it settles, with the wait the server named, if it named one. */
interface ReadLeaves {
  held: null;
  settled(verdict: ReadVerdict, namedWaitS?: number | null): void;
}
/** A read answered here: the server is not answering, and this is how long is left, in seconds. */
interface ReadHeld {
  held: number;
}

export interface Trouble {
  /**
   * Asked before a read of an address leaves: whether it leaves or is answered here. Said at once where the tab stands
   * or holds, so a read leaves in the turn it was asked in, as it always did; a promise only while looks are out or the
   * tab mends.
   */
  before(address: string): ReadLeaves | ReadHeld | Promise<ReadLeaves | ReadHeld>;
  /** A write, or any answer outside a read: the server answered, so the tab is as it was. */
  answered(): void;
  /** A person asked: the wait ends now, and the next reads look. */
  lookNow(): void;
  /** Whether reads are being held. */
  waiting(): boolean;
  /** Hear the wait come due (the runner's reads then look); answers the stop. */
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

/** The looks out once a wait is over: which addresses, how many still out, and what they come to together. */
interface Round {
  addresses: Set<string>;
  out: number;
  /** How many of them failed, so far. */
  failed: number;
  /** The longest wait a look that failed was told. */
  namedWaitS: number;
  /** Begun by a witness before the wait was over: failed, it leaves the wait as it stands. */
  early: boolean;
  verdict: Promise<boolean>;
  say: (answered: boolean) => void;
}

/** A round of looks begun now, with none out yet. */
function newRound(early: boolean): Round {
  let say: (answered: boolean) => void = () => {};
  const verdict = new Promise<boolean>((resolve) => (say = resolve));
  return { addresses: new Set(), out: 0, failed: 0, namedWaitS: 0, early, verdict, say };
}

/** While the tab mends: reads leave a few at a time, for a while from when the server answered again. */
function mendingOf(now: () => number) {
  let until = 0;
  let out = 0;
  const turns: Array<() => void> = [];
  return {
    begin: (): void => void (until = now() + MENDING_MS),
    lasts: (): boolean => now() < until,
    /** A read's turn, once a lane is free: answers the hand that gives the lane back. */
    async turn(): Promise<() => void> {
      if (out >= MENDING_LANES) await new Promise<void>((free) => turns.push(free));
      out += 1;
      return () => {
        out -= 1;
        turns.shift()?.();
      };
    },
  };
}

/** The wait's end, said to whoever listens: armed for each wait, let go where the wait ends some other way. */
function dueOf(after: NonNullable<TroubleDeps["after"]>) {
  const listeners = new Set<() => void>();
  let stop: (() => void) | null = null;
  const letGo = (): void => {
    stop?.();
    stop = null;
  };
  return {
    letGo,
    arm(wait: number): void {
      letGo();
      stop = after(wait, () => {
        stop = null;
        for (const fn of [...listeners]) fn();
      });
    },
    hear(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function troubleOf(deps: TroubleDeps = {}): Trouble {
  const now = deps.now ?? (() => Date.now());
  const chance = deps.chance ?? Math.random;
  const due = dueOf(deps.after ?? browserTimer);
  const mending = mendingOf(now);

  /** Faults in a row and the addresses they were on, while the tab stands. */
  let faults = 0;
  const addresses = new Set<string>();
  /** The addresses that have failed since the trouble began: one of them looks only where it is the first read asked. */
  const failedSince = new Set<string>();
  /** While reads are held: when the wait ends, and how long it was before chance. */
  let until: number | null = null;
  let waitMs = WAIT_FIRST_MS;
  /** The witnesses this wait still lets leave before its end. */
  let witnesses = 0;
  let round: Round | null = null;

  const stand = () => {
    faults = 0;
    addresses.clear();
    failedSince.clear();
    until = null;
    waitMs = WAIT_FIRST_MS;
    due.letGo();
  };
  const hold = (namedWaitS: number | null | undefined) => {
    const ours = waitMs * (1 + chance() * WAIT_SPREAD);
    const wait = Math.max(ours, (namedWaitS ?? 0) * SECOND_MS);
    until = now() + wait;
    witnesses = WITNESSES_A_WAIT;
    due.arm(wait);
  };
  const leftS = (): number => Math.max(1, Math.ceil(((until ?? now()) - now()) / SECOND_MS));

  /** What a read that left while the tab stood, or mended, says as it settles. */
  const settledAs =
    (address: string, done: () => void): ReadLeaves["settled"] =>
    (verdict, namedWaitS) => {
      done();
      if (verdict === "called_off") return;
      if (verdict === "answered") {
        // The server answers. Looks out decide for themselves; otherwise whatever was counted, or held, is over.
        if (round) return;
        if (until !== null) mending.begin();
        stand();
        return;
      }
      if (until !== null) {
        // Already held: a read that left before the hold says only that its address failed too.
        failedSince.add(address);
        return;
      }
      faults += 1;
      addresses.add(address);
      if (faults < FAULTS_AT || addresses.size < ADDRESSES_AT) return;
      for (const failed of addresses) failedSince.add(failed);
      hold(namedWaitS);
    };

  /** The round's end: answered, the tab is as it was and mends; all failed, the wait doubles. */
  const endRound = (ended: Round, answered: boolean | null) => {
    if (round !== ended) return;
    round = null;
    if (answered === true) {
      stand();
      mending.begin();
    } else if (answered === false && !ended.early) {
      waitMs = Math.min(waitMs * 2, WAIT_MAX_MS);
      hold(ended.namedWaitS);
    }
    // Every look called off (null): the wait stays over, and the next read asked for looks. A witness that failed
    // before the wait's end leaves the wait as it stands.
    ended.say(answered === true);
  };

  /** What a look says as it settles: one answered ends the round at once; the last to fail ends it failed. */
  const lookSettled =
    (mine: Round, address: string): ReadLeaves["settled"] =>
    (verdict, namedWaitS) => {
      if (round !== mine) return;
      if (verdict === "answered") return endRound(mine, true);
      mine.out -= 1;
      if (verdict === "fault") {
        failedSince.add(address);
        mine.failed += 1;
        mine.namedWaitS = Math.max(mine.namedWaitS, namedWaitS ?? 0);
      }
      if (mine.out > 0) return undefined;
      // The last look is in: failed where any of them failed; nothing said where every one was called off.
      return endRound(mine, mine.failed > 0 ? false : null);
    };

  /** A read joins the looks out, as one of them. */
  const lookWith = (mine: Round, address: string): ReadLeaves => {
    mine.addresses.add(address);
    mine.out += 1;
    return { held: null, settled: lookSettled(mine, address) };
  };

  /** This read is the first of the looks: the wait is over, or it is a witness that leaves before its end (`early`). */
  const beginRound = (address: string, early: boolean): ReadLeaves => {
    round = newRound(early);
    return lookWith(round, address);
  };

  /** While the wait lasts: a read of an address that has not failed leaves as a witness, a couple a wait; any other is held. */
  const heldOrWitness = (address: string): ReadLeaves | ReadHeld => {
    if (failedSince.has(address) || witnesses <= 0) return { held: leftS() };
    witnesses -= 1;
    return beginRound(address, true);
  };

  const before = (address: string): ReturnType<Trouble["before"]> => {
    if (round) {
      // Looks are out. A read of an address that has not failed joins them, a few at most: the witness a route's own
      // fault cannot silence. Any other waits for what they say, which is its answer too.
      const fresh = !failedSince.has(address) && !round.addresses.has(address);
      if (fresh && round.addresses.size < LOOKS_A_ROUND) return lookWith(round, address);
      return round.verdict.then((answered) => (answered ? before(address) : { held: leftS() }));
    }
    if (until !== null) return now() < until ? heldOrWitness(address) : beginRound(address, false);
    if (!mending.lasts()) return { held: null, settled: settledAs(address, () => {}) };
    return mending.turn().then((done) => ({ held: null, settled: settledAs(address, done) }));
  };

  return {
    before,
    answered() {
      if (round) return; // the looks' own answers decide
      if (until !== null) mending.begin();
      stand();
    },
    lookNow() {
      if (until === null || round) return;
      until = now();
      due.letGo();
    },
    waiting: () => until !== null,
    onDue: (fn) => due.hear(fn),
  };
}
