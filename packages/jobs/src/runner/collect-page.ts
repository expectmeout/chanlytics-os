/**
 * The platform's page for a lead search's collect that failed for good (ledger PAGES_THE_PLATFORM, tick.ts conclude).
 * The owner is not told by the job (ledger TOLD_ELSEWHERE): the lead sweep fails a run whose collects keep failing and,
 * as its round's last live run, ends the round source_failed (apps/edge/lib/leads/lead-sweep.ts), and the round's own
 * notice says the search stopped (00491). On 29 Oct 2026 the job's notice was told fourteen times for one search, each
 * "will not start again on its own" while the sweep started another collect every five minutes, and the operator heard
 * nothing. A collect that fails the same way in several searches is the platform's: a judge call past its bound, a build
 * the source's provider deleted, a provider down. One key per workspace: the pager sends once per window for each, so one
 * search failing over and over does not hide another workspace's first.
 */
import { carried } from "./delivery-page";

/** The pager's condition key: one page per window for every collect of one workspace that failed for good. */
export function collectPageKey(job: { tenant_id: string }): string {
  return `lead_collect_failed:${job.tenant_id}`;
}

/** What the page says: the collect and its run (core leads runner, `{ run_id, seq }`), why it stopped, and where to look. */
export function collectPage(
  job: { id: string; tenant_id: string; payload: unknown },
  reason: string,
  wreckage: string | null = null,
): { subject: string; body: string } {
  return {
    subject: "A lead search's collect failed for good",
    body: [
      `Collect ${carried(job.payload, "seq")} of lead run ${carried(job.payload, "run_id")} failed for good in ` +
        `workspace ${job.tenant_id}: ${reason}.`,
      wreckage,
      "The owner was not told by this job: after three failed collects the sweep fails the run and ends its round " +
        "source_failed, and the round's own notice says the search stopped. Newest first:\n\n" +
        "  select id, tenant_id, payload, attempts, last_error, updated_at from jobs " +
        "where kind = 'lead_collect' and state = 'failed' order by updated_at desc limit 20;",
      `Reference: job ${job.id} (lead_collect).`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
