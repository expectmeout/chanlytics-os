/**
 * The platform's page for a workspace's handed-out job that failed for good (ledger PAGES_THE_PLATFORM, tick.ts conclude): the
 * job a clock handed it for its campaigns, its reach-out steps, its calendar or its Google read (decision 0115), or for the
 * steps due to one person each (0119). Such a job
 * throws only when it cannot read what is due, or what it runs on: a database or a provider, nothing an owner can act on. The
 * work stays due and the next hour's clock hands out another job, so it is late, not lost.
 *
 * One key per kind, not per workspace: the fault behind this is rarely one workspace's, and a thousand workspaces failing the
 * same hour is one page and the query that lists them.
 */
import type { JobKind, TenantId } from "@chanlytics/contracts";

/** The kinds a clock hands out. */
export const HANDED_OUT_KINDS = [
  "campaign_moments",
  "reach_out_steps",
  "calendar_read",
  "google_read",
  "texts_read",
  "sequence_occasions",
] as const satisfies readonly JobKind[];

type HandedOutKind = (typeof HANDED_OUT_KINDS)[number];

const HANDED_OUT_WORDS: Record<HandedOutKind, string> = {
  campaign_moments: "campaign moments",
  reach_out_steps: "reach-out steps",
  calendar_read: "calendar read",
  google_read: "Google read",
  texts_read: "texts read",
  sequence_occasions: "steps due to one person",
};

/** The pager's condition key: one page per window for every workspace whose job of this kind failed for good. */
export function handedOutPageKey(kind: HandedOutKind): string {
  return `${kind}_failed`;
}

/** What the page says: whose job, why it stopped, that the work is only late, and where to look for the others. */
export function handedOutPage(
  kind: HandedOutKind,
  job: { id: string; tenant_id: TenantId },
  reason: string,
  wreckage: string | null = null,
): { subject: string; body: string } {
  return {
    subject: `A workspace's ${HANDED_OUT_WORDS[kind]} failed for good`,
    body: [
      `The ${HANDED_OUT_WORDS[kind]} of workspace ${job.tenant_id} failed for good: ${reason}.`,
      wreckage,
      "What was due is still due, and the clock's next turn hands the workspace another job, so it is late, not lost. " +
        "The owner was not told: it is nothing they can mend. This page is sent once however many workspaces fail, " +
        "so see how many did. Newest first:\n\n" +
        "  select id, tenant_id, attempts, last_error, updated_at from jobs " +
        `where kind = '${kind}' and state = 'failed' order by updated_at desc limit 20;`,
      `Reference: job ${job.id} (${kind}).`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
