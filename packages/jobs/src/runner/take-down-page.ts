/**
 * The platform's page for a take-down a place never confirmed (ledger PAGES_THE_PLATFORM, tick.ts conclude; 00692, the
 * content loop PRD's 8.3). The owner asked for a post to come down, or a person took their yes back; the place was asked,
 * and asked again for a day, and never said. Nothing is the owner's to do: their piece says the place has not confirmed
 * it and that Chanlytics is on it, and the action stays pending. A place down for a day, a connection Meta refuses for
 * every call, or a post the place no longer answers for is ours to look at. One key per workspace, so one business's
 * unconfirmed take-downs do not hide another's first.
 */
import { carried } from "./delivery-page";
import type { TenantId } from "@chanlytics/contracts";

/** The pager's condition key: one page per window for every take-down of one workspace that got no answer. */
export function takeDownPageKey(job: { tenant_id: TenantId }): string {
  return `post_take_down_unconfirmed:${job.tenant_id}`;
}

/** What the page says: the action, why its job stopped, and where to look. */
export function takeDownPage(
  job: { id: string; tenant_id: TenantId; payload: unknown },
  reason: string,
  wreckage: string | null = null,
): { subject: string; body: string } {
  return {
    subject: "A post's take-down was never confirmed by its place",
    body: [
      `Take-down action ${carried(job.payload, "action_id")} in workspace ${job.tenant_id} got no answer from its ` +
        `place: ${reason}.`,
      wreckage,
      "The owner was not told by this job: their piece says the place has not confirmed it and that Chanlytics is on " +
        "it. The post is still marked up, and may be. Look at the place's own answer for the post, then settle the " +
        "action through post_take_down_settle, or ask it again by scheduling its job. The actions still waiting:\n\n" +
        "  select a.id, a.tenant_id, a.target_id, a.started_at, p.place, p.kind, p.external_id, p.permalink " +
        "from remediation_actions a join posts p on p.id = a.target_id " +
        "where a.act = 'take_down' and a.outcome = 'pending' order by a.started_at limit 20;",
      `Reference: job ${job.id} (post_take_down).`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
