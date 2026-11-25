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
 *  - Once the wait is over, two reads leave to look: the first asked for, and one more of an address that has not
 *    failed since the trouble began. Reads asked for while they are out wait for what they say. One answered, and
 *    the tab is as it was; all failed, and the wait doubles: 5 s, then 10, 20, 40 and on to five minutes, each a little
 *    longer by chance so tabs do not look as one. A wait the server names (`Retry-After`) is kept where it is longer.
 *  - Once a look is answered, reads leave a few at a time for a while: every surface held back would otherwise ask in the
 *    same instant, in every tab, of a database that has just come back.
 *
 * Why more than one read looks: two reads broken by a fault of their own (a route's bug, not the server's) trip the
 * hold as an outage does, and a tab that then looked through one of them alone would hold every healthy read back for
 * as long as the page stayed open. A read of an address that has not failed is the witness that ends it at once, so
 * those leave during a wait too, one at a time, without waiting for its end: a press that opens another page is
 * answered by the server where the server answers, and a healthy read beside several broken ones is held for no longer
 * than the broken ones take to say so. Until the outage is plain: once eight addresses have failed with none answered
 * between, nothing more leaves but the looks. A page reads thirty addresses, and in an outage each of them is one that
 * "has not failed" until it has (counted on CI's stack, 25 Nov 2026: with witnesses for as long as there were addresses,
 * a tab sent 27 requests in an outage's first minute).
 *
 * One request that carried a page's reads and failed whole (the head's opening, the rest of a load) holds the tab at
 * once, and one of its reads looks, alone. Answered, the failure was that request's own, and the others follow it a few
 * at a time; failed, the outage is plain. Each asked alone at once, as they were, one failure became twenty requests.
 *
 * A person's own press (the shell's Retry, the network coming back) ends the wait at once: the next reads look. A write
 * is never held: it is somebody's act, and its answer says the server answers.
 *
 * One failing read is not trouble (a route with a fault of its own): it takes several routes failing with nothing
 * answered between. And what "has not failed" is judged by is the read's whole address, its query with it: a route that
 * fails for one period of a report and answers another is no reason to hold the other back. Pure: the clock, the chance and the timer are handed in, so it runs under node.
 */
import { MIN_MS, SECOND_MS } from "@chanlytics/contracts";

/** This many reads failed in a row, on at least ROUTES_AT routes, and the server is not answering this tab. */
const FAULTS_AT = 3;
const ROUTES_AT = 2;
/** The first wait before the tab looks again; doubled at each round of looks that fails, to WAIT_MAX_MS. */
const WAIT_FIRST_MS = 5 * SECOND_MS;
const WAIT_MAX_MS = 5 * MIN_MS;
/** How much longer a wait may be by chance, as a share of itself. */
const WAIT_SPREAD = 0.25;
/** How many reads look once a wait is over: the first asked, and one of an address that has not failed. */
const LOOKS_A_ROUND = 2;
/**
 * This many addresses failed since the trouble began, with none answered between, and the outage is plain: no witness
 * leaves during a wait any more.
 */
const PLAIN_AT = 8;
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
   * Asked before a read leaves: whether it leaves or is answered here. `address` is the read's own (its path and its
   * query), `route` the route it is of, its own address where none is said. Said at once where the tab stands or holds,
   * so a read leaves in the turn it was asked in, as it always did; a promise only while looks are out or the tab mends.
   */
  before(address: string, route?: string): ReadLeaves | ReadHeld | Promise<ReadLeaves | ReadHeld>;
  /** A write, or any answer outside a read: the server answered, so the tab is as it was. */
  answered(): void;
  /**
   * One request that carried many reads failed whole (contracts FAILED_WHOLE). The tab holds at once, and the next read
   * of an address that has not failed looks, alone: answered, the rest leave; failed, no witness leaves any more.
   */
  failedWhole(): void;
  /** A person asked: the wait ends now, and the next reads look. */
  lookNow(): void;
  /**
   * A page's boot begins: the tab stands, whatever an earlier page left held. A load makes a client of its own, so this
   * changes nothing there; it is for a page drawn again by the same client (development's second mount, a test's next page),
   * whose reads would otherwise be answered with the trouble of the page before.
   */
  standAgain(): void;
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
    /** Over at once: every read waiting its turn leaves. */
    end(): void {
      until = 0;
      for (const free of turns.splice(0)) free();
    },
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

/** The faults in a row while the tab stands: the routes they were on, and the addresses. */
function faultsInARow() {
  let faults = 0;
  const routes = new Set<string>();
  const addresses = new Set<string>();
  return {
    addresses,
    clear(): void {
      faults = 0;
      routes.clear();
      addresses.clear();
    },
    /** One more: answers whether the server is not answering now (FAULTS_AT in a row, on ROUTES_AT routes). */
    add(address: string, route: string): boolean {
      faults += 1;
      routes.add(route);
      addresses.add(address);
      return faults >= FAULTS_AT && routes.size >= ROUTES_AT;
    },
  };
}

/** A request that carried many reads failed whole: one read is owed a look, and no other witness leaves. */
function wholeFailureOf() {
  let failed = false;
  let owed = false;
  return {
    clear(): void {
      failed = false;
      owed = false;
    },
    /** Said as it fails: the look is owed where the tab was standing until now. */
    note(wasStanding: boolean): void {
      failed = true;
      if (wasStanding) owed = true;
    },
    /** Whether this read is the one that looks: once. */
    takesLook(): boolean {
      const mine = owed;
      owed = false;
      return mine;
    },
    /** The look said nothing (its caller called it off): the next read looks in its place. */
    giveBack(): void {
      if (failed) owed = true;
    },
    plain: (): boolean => failed,
  };
}

export function troubleOf(deps: TroubleDeps = {}): Trouble {
  const now = deps.now ?? (() => Date.now());
  const chance = deps.chance ?? Math.random;
  const due = dueOf(deps.after ?? browserTimer);
  const mending = mendingOf(now);
  const inARow = faultsInARow();
  const whole = wholeFailureOf();
  /** The addresses that have failed since the trouble began: one of them looks only where it is the first read asked. */
  const failedSince = new Set<string>();
  /** While reads are held: when the wait ends, and how long it was before chance. */
  let until: number | null = null;
  let waitMs = WAIT_FIRST_MS;
  let round: Round | null = null;

  const stand = () => {
    inARow.clear();
    whole.clear();
    failedSince.clear();
    until = null;
    waitMs = WAIT_FIRST_MS;
    due.letGo();
  };
  const hold = (namedWaitS: number | null | undefined) => {
    const ours = waitMs * (1 + chance() * WAIT_SPREAD);
    const wait = Math.max(ours, (namedWaitS ?? 0) * SECOND_MS);
    until = now() + wait;
    due.arm(wait);
  };
  const leftS = (): number => Math.max(1, Math.ceil(((until ?? now()) - now()) / SECOND_MS));

  /** What a read that left while the tab stood, or mended, says as it settles. */
  const settledAs =
    (address: string, route: string, done: () => void): ReadLeaves["settled"] =>
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
      if (!inARow.add(address, route)) return;
      for (const failed of inARow.addresses) failedSince.add(failed);
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
    } else if (answered === null && ended.early) whole.giveBack();
    // Called off (null): the wait stays as it is, and the next read asked looks. A witness that failed leaves it too.
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

  /** While the wait lasts: an address that has not failed is a witness, until the outage is plain; any other is held. */
  const heldOrWitness = (address: string): ReadLeaves | ReadHeld => {
    if (failedSince.has(address)) return { held: leftS() };
    if (whole.takesLook()) return beginRound(address, true);
    if (whole.plain() || failedSince.size >= PLAIN_AT) return { held: leftS() };
    return beginRound(address, true);
  };

  const before = (address: string, route: string = address): ReturnType<Trouble["before"]> => {
    if (round) {
      // Looks are out. A read of an address that has not failed joins them, to LOOKS_A_ROUND; a wait's own witness looks
      // alone. Any other waits on what they say: a witness failed, and it is judged again (it may be the next itself).
      const fresh = !failedSince.has(address) && !round.addresses.has(address);
      if (fresh && !round.early && round.addresses.size < LOOKS_A_ROUND) return lookWith(round, address);
      const { early, verdict } = round;
      return verdict.then((answered) => (answered || early ? before(address, route) : { held: leftS() }));
    }
    if (until !== null) return now() < until ? heldOrWitness(address) : beginRound(address, false);
    if (!mending.lasts()) return { held: null, settled: settledAs(address, route, () => {}) };
    return mending.turn().then((done) => ({ held: null, settled: settledAs(address, route, done) }));
  };

  return {
    before,
    answered() {
      if (round) return; // the looks' own answers decide
      if (until !== null) mending.begin();
      stand();
    },
    failedWhole() {
      if (round) return; // looks are out: what they say decides
      whole.note(until === null);
      if (until === null) hold(null);
    },
    lookNow() {
      if (until === null || round) return;
      until = now();
      due.letGo();
    },
    standAgain() {
      // Looks still out say nothing to a page that has begun again; what waited on them leaves.
      const out = round;
      round = null;
      stand();
      mending.end();
      out?.say(true);
    },
    waiting: () => until !== null,
    onDue: (fn) => due.hear(fn),
  };
}
