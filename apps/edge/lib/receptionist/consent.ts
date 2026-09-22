/**
 * Whether the receptionist may reply to this person at all.
 *
 * Pure and dependency-free, for the same reason reply-posture.ts is: the
 * answer has two sources that disagree under exactly the conditions nobody
 * exercises by hand — an opt-out from last week, a START arriving in the same
 * message — and a truth table can be read and tested, while two `||` clauses
 * inline in a 700-line handler cannot.
 *
 * Consent lives in `contacts.consent`, which only Postgres knows. There used
 * to be a third source, a copy cached on the retired Blob thread, for the
 * case where Postgres did not answer. It has no case left: the memory is
 * Postgres, so a message whose thread could not be read never reaches this
 * gate — it is handed to a person instead.
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
}

export type ConsentSource = "this_message" | "record" | "none";

export interface ConsentDecision {
  optedOut: boolean;
  /** Which input decided it — logged, so a disagreement is legible after the fact. */
  source: ConsentSource;
}

export function resolveConsent(i: ConsentInputs): ConsentDecision {
  // 1. The message in hand outranks any record. Local knowledge, so it holds
  //    even with no database at all — and a STOP must never wait on a query.
  if (i.optOutNow) return { optedOut: true, source: "this_message" };

  // 2. An explicit START is the documented way back, and it must work whatever
  //    the record says — the one state a customer cannot otherwise escape by
  //    any action of their own.
  if (i.optInNow) return { optedOut: false, source: "this_message" };

  // 3. Postgres owns consent. When it answered, its answer is final.
  if (i.recorded !== null) return { optedOut: i.recorded, source: "record" };

  // 4. No record at all: there is nothing to go on and the reply proceeds,
  //    which is the pre-existing behaviour and is documented as the remaining
  //    ceiling — blocking every reply on a missing record would be its own
  //    outage.
  return { optedOut: false, source: "none" };
}
