/**
 * Whether the receptionist may reply to this person at all.
 *
 * Pure and dependency-free, for the same reason reply-posture.ts is: the answer
 * has three possible sources that disagree under exactly the conditions nobody
 * exercises by hand — Postgres down, an opt-out from last week, a START arriving
 * mid-outage — and a truth table can be read and tested, while three `||`
 * clauses inline in a 700-line handler cannot.
 *
 * Consent lives in `contacts.consent`, which only Postgres knows. The cache
 * exists because that made the guarantee fail open precisely when it mattered:
 * with the database unreachable the ingest result is null, so a customer who
 * opted out silently became opted in again for the length of the outage.
 */
export interface ConsentInputs {
  /** THIS message is an explicit opt-out (STOP / BAJA / unsubscribe / alto). */
  optOutNow: boolean;
  /** THIS message is an explicit opt-in (START / ALTA) — the only way back. */
  optInNow: boolean;
  /**
   * What Postgres says, or null if it did not answer. `false` and `null` are
   * emphatically different: one is a record saying they are opted in, the other
   * is no record at all.
   */
  recorded: boolean | null;
  /** Consent cached on the thread by a previous request. */
  cached: boolean | undefined;
}

export type ConsentSource = "this_message" | "record" | "cache" | "none";

export interface ConsentDecision {
  optedOut: boolean;
  /** Which input decided it — logged, so an outage is legible after the fact. */
  source: ConsentSource;
  /** What the thread's cache should hold after this request. */
  cache: boolean;
}

export function resolveConsent(i: ConsentInputs): ConsentDecision {
  // 1. The message in hand outranks any record. Local knowledge, so it holds
  //    even with no database at all — and a STOP must never wait on a query.
  if (i.optOutNow) return { optedOut: true, source: "this_message", cache: true };

  // 2. An explicit START is the documented way back, and it must work during an
  //    outage too. Without this the cache below would hold someone out
  //    indefinitely while Postgres was unreachable — the one state a customer
  //    cannot escape by any action of their own.
  if (i.optInNow) return { optedOut: false, source: "this_message", cache: false };

  // 3. Postgres owns consent. When it answered, its answer is final, and the
  //    cache is refreshed from it rather than consulted.
  if (i.recorded !== null) {
    return { optedOut: i.recorded, source: "record", cache: i.recorded };
  }

  // 4. Postgres did not answer. The cached copy is all that is left; absent a
  //    cache there is nothing to go on and the reply proceeds, which is the
  //    pre-existing behaviour and is documented as the remaining ceiling —
  //    blocking every reply whenever the database blips would be its own outage.
  if (i.cached === true) return { optedOut: true, source: "cache", cache: true };
  return { optedOut: false, source: "none", cache: false };
}
