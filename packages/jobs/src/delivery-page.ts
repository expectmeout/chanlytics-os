/**
 * The platform's page for a change's delivery that failed for good (00334, decision 0032): the ledger's words to the
 * operator, under one condition key, whichever way it failed. The tick pages it when the job's last try fails (ledger
 * PAGES_THE_PLATFORM, tick.ts conclude); the handler pages it when the event was purged before its delivery ran,
 * since that job completes (handlers.ts eventDeliver). One key per subscriber: the pager (the edge's pageOperator)
 * sends once per window for each, so one subscriber failing over and over does not hide another's first failure, and
 * the operator reads event_deliveries for the rest. The owner is never told: a subscriber that fails is
 * nothing they can act on, and the bell used to say so in their words (contracts JOB_WORK, kept for the record).
 */

/** A field the relay's payload carries (00334), or "unknown" when it carries none. */
function carried(payload: unknown, key: string): string {
  const p = (payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {}) as Record<
    string,
    unknown
  >;
  const v = p[key];
  return typeof v === "string" && v ? v : "unknown";
}

/** The pager's condition key: one page per window for every delivery to one subscriber that failed for good. */
export function deliveryPageKey(job: { payload: unknown }): string {
  return `event_deliver_failed:${carried(job.payload, "subscriber")}`;
}

/** What the page says: the job and its workspace, what it carried (the relay's payload, 00334), why it stopped, and where to look. */
export function deliveryPage(
  job: { id: string; tenant_id: string; payload: unknown },
  reason: string,
  wreckage: string | null = null,
): { subject: string; body: string } {
  const named = (key: string) => carried(job.payload, key);
  return {
    subject: "A change was not passed on to what reads it",
    body: [
      `The delivery of event ${named("event_id")} (${named("kind")}) to the ${named("subscriber")} subscriber ` +
        `failed for good in workspace ${job.tenant_id}: ${reason}.`,
      wreckage,
      "The delivery row says what the subscriber was handed and why it stopped. The owner was not told: the fault is " +
        "the platform's, not theirs. Newest first:\n\n" +
        "  select event_id, subscriber, kind, state, attempts, last_error, updated_at from event_deliveries " +
        "where state = 'failed' order by updated_at desc limit 20;",
      "Once the subscriber is mended, event_deliveries_redrive('<subscriber>') schedules every failed delivery of it " +
        "again; an event the ledger no longer holds cannot be delivered, and its row stays failed as the record.",
      `Reference: job ${job.id} (event_deliver).`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
