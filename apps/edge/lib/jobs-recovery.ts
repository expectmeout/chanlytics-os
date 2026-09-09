/**
 * What to do with a job whose QStash message never arrived.
 *
 * A `scheduled` job past its time provably never ran — nothing claimed it — so
 * unlike a job stuck in `fired`, re-publishing cannot repeat work already
 * done. That is why this rule and the one in the sweep above it reach opposite
 * conclusions from the same symptom, and why they are written apart rather
 * than folded into one "stuck" branch.
 *
 * The ledger, not QStash's deduplication, is what stops a job firing twice:
 * `claim_job` refuses anything that is not still `scheduled`.
 */

/**
 * QStash retries three times with exponential backoff — 12s, 2m28s, 30m8s —
 * so a message is exhausted and in the dead-letter queue at about 33 minutes.
 * Anything sooner races a delivery still in flight; thirty minutes was the
 * first number chosen here and it was wrong for exactly that reason.
 */
export const OVERDUE_AFTER_MS = 45 * 60_000;

/** A message nobody will ever accept must not be published every tick for ever. */
export const MAX_REPUBLISHES = 3;

/**
 * A reply six hours late reaches someone who stopped waiting. Past this an
 * operator decides whether to say it again, rather than the system deciding
 * for them — so only the kinds that speak to a person are held to it. A snooze
 * or a pause that wakes late is merely late.
 */
export const STALE_TO_A_PERSON_MS = 6 * 60 * 60_000;

const SPEAKS_TO_A_PERSON = new Set(["outbound_send", "broadcast_send"]);

export type Recovery = "wait" | "republish" | "give_up";

export interface OverdueJob {
  kind: string;
  due_at: string;
  republishes: number;
}

export function recoveryFor(job: OverdueJob, nowMs: number = Date.now()): Recovery {
  const overdueBy = nowMs - Date.parse(job.due_at);
  // `!(x >= y)` rather than `x < y`: an unparseable due_at gives NaN, and NaN
  // fails both comparisons — this way it waits rather than being treated as
  // infinitely overdue and published on every tick.
  if (!(overdueBy >= OVERDUE_AFTER_MS)) return "wait";
  if (job.republishes >= MAX_REPUBLISHES) return "give_up";
  if (SPEAKS_TO_A_PERSON.has(job.kind) && overdueBy > STALE_TO_A_PERSON_MS) return "give_up";
  return "republish";
}
