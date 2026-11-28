/**
 * What the door holds a call to before it leaves: a "too many" the service said, and how many calls run at once (lane 8
 * of the "prove it works" plan, 28 Nov 2026).
 *
 * A hold is a "too many" honoured. The service said how long to wait (its Retry-After, or Graph's own minutes in a usage
 * header): until then the calls it named are not made. A "too many" that names no wait holds nothing: the caller's
 * backoff chooses, and the gate below is lowered all the same. Whose calls it names is the
 * answer's scope (provider-rules.ts): a workspace's "too many" holds that workspace's calls to that provider, the
 * platform's holds everyone's, and one person written to too often holds nobody. Before it, a "too many" was the one
 * call's: the next call asked at once and was refused the same way, and a job's retry came back sooner than the wait.
 *
 * A gate is how many calls run at once, per limit holder (a workspace's own, or the platform's). It opens at the row's
 * `atOnce`, generous, so an ordinary day never queues; a "too many" halves it, and each run of answers as long as the
 * gate is wide raises it by one, back to the row's. A call that finds no room waits for one, as long as its deadline
 * allows and never longer than a retry may wait; past that it is answered "not now" without leaving.
 *
 * The state lives in this instance, one for the process (a registered symbol, as the breakers' is): each serverless
 * instance learns a service's pace for itself.
 */
import { globalSlot } from "@chanlytics/contracts";

/** The longest a call waits for room, or for a hold to end, before it is answered "not now" instead. */
export const PACE_WAIT_CAP_MS = 2_000;

interface Gate {
  /** How many may run at once now. */
  room: number;
  /** How many are running. */
  running: number;
  /** Answers since the gate last changed: a run of them as long as the gate is wide raises it by one. */
  answered: number;
  /** The calls waiting for room, first come first. */
  waiting: (() => void)[];
}

interface Pace {
  holds: Map<string, number>;
  gates: Map<string, Gate>;
}
const pace = globalSlot<Pace>("chanlytics.provider-pace").keep(() => ({ holds: new Map(), gates: new Map() }));

/** Every hold and gate let go: for a test, which must not inherit the last test's pace. */
export function resetPace(): void {
  pace.holds.clear();
  pace.gates.clear();
}

/** How long a holder's calls are still held, in ms from `now`; 0 when they are not. */
export function holdLeftOf(key: string, now: number): number {
  const until = pace.holds.get(key);
  if (until === undefined) return 0;
  if (until > now) return until - now;
  pace.holds.delete(key);
  return 0;
}

/** Hold a holder's calls until `until`: a later hold is kept, an earlier one never shortens it. */
export function holdUntil(key: string, until: number): void {
  if ((pace.holds.get(key) ?? 0) < until) pace.holds.set(key, until);
}

function gateOf(key: string, atOnce: number): Gate {
  let gate = pace.gates.get(key);
  if (!gate) {
    gate = { room: atOnce, running: 0, answered: 0, waiting: [] };
    pace.gates.set(key, gate);
  }
  return gate;
}

/**
 * Room for one call under a holder's gate: a release to call once the call has its answer, or null when no room came
 * within `waitMs`. `wait` is the clock's: it resolves when the time has passed (a test hands in its own).
 */
export async function takeRoom(
  key: string,
  atOnce: number,
  waitMs: number,
  wait: (ms: number) => Promise<void>,
): Promise<(() => void) | null> {
  if (!Number.isFinite(atOnce)) return () => undefined;
  const gate = gateOf(key, atOnce);
  if (gate.running >= gate.room) {
    if (waitMs <= 0) return null;
    const turn = { woken: false };
    let wake: () => void = () => undefined;
    const roomCame = new Promise<void>((resolve) => {
      wake = () => {
        turn.woken = true;
        resolve();
      };
    });
    gate.waiting.push(wake);
    await Promise.race([roomCame, wait(waitMs)]);
    if (!turn.woken) {
      gate.waiting.splice(gate.waiting.indexOf(wake), 1);
      return null;
    }
    // The call that left handed its room over: it is counted as running already (letNextIn).
  } else gate.running += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    gate.running -= 1;
    letNextIn(key, gate, atOnce);
  };
}

/**
 * Room came: the waiting calls go, first come first, while there is room, each counted as running as it is woken so
 * the next is let in only to room that is still free. A gate with nothing in it at its full width is forgotten.
 */
function letNextIn(key: string, gate: Gate, atOnce: number): void {
  while (gate.running < gate.room && gate.waiting.length > 0) {
    gate.running += 1;
    gate.waiting.shift()?.();
  }
  if (gate.running === 0 && gate.waiting.length === 0 && gate.room >= atOnce) pace.gates.delete(key);
}

/**
 * What an answer tells a gate: a "too many" halves its room (never under one call); an answer, once the gate has been
 * as wide as it is now for that many answers, raises it by one, up to the row's.
 */
export function paceAfter(key: string, atOnce: number, tooMany: boolean): void {
  if (!Number.isFinite(atOnce)) return;
  const gate = gateOf(key, atOnce);
  if (tooMany) {
    gate.room = Math.max(1, Math.floor(gate.room / 2));
    gate.answered = 0;
    return;
  }
  if (gate.room >= atOnce) return;
  gate.answered += 1;
  if (gate.answered >= gate.room) {
    gate.room += 1;
    gate.answered = 0;
    letNextIn(key, gate, atOnce);
  }
}
