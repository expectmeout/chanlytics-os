/**
 * The plan's proposal to ask every client for a review (the content loop's pass 6; the PRD's 10.5; the content canvas's
 * Loop4, approved by Ruben on 24 Nov 2026), on the Week's foot and on Today, read by readers/week-today.ts readReviewAsk.
 * Not now rests it: a decision of the workspace's (`snooze`, about `review_ask`), read back for 30 days. The card's
 * Approve is POST playbooks itself, with the after-visit starter (contracts REVIEW_ASK_START): nothing here starts one.
 */
import "server-only";
import { REVIEW_ASK_REST_DAYS, DAY_MS } from "@chanlytics/contracts";
import type { Member } from "../shared/route";
import { recordDecision } from "../shared/verbs";
import type { RouteContext } from "../shared/with-route";

/** Not now: the proposal rests for 30 days, kept as the workspace's decision with when it comes back. */
export async function snoozeReviewAsk(ctx: RouteContext, member: Member): Promise<{ rested_until: string }> {
  const until = new Date(Date.now() + REVIEW_ASK_REST_DAYS * DAY_MS).toISOString();
  await recordDecision(ctx, member.tenantId, "workspace", member.tenantId, "snooze", {
    about: "review_ask",
    until,
  });
  return { rested_until: until };
}
