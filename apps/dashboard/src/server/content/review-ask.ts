/**
 * The plan's proposal to ask every client for a review (the content loop's pass 6; the PRD's 10.5; the content canvas's
 * Loop4, approved by Ruben on 24 Nov 2026), on the Week's foot and on Today: worked out by contracts reviewAskOf from the
 * owner's goals, the business's review link, whether an ask already runs, when it was last rested, and the newest review.
 * Not now rests it: a decision of the workspace's (`snooze`, about `review_ask`), read back for 30 days. The card's
 * Approve is POST playbooks itself, with the after-visit starter (contracts REVIEW_ASK_START): nothing here starts one.
 */
import "server-only";
import { reviewAskOf, REVIEW_ASK_REST_DAYS, DAY_MS, type ReviewAskDto, type TenantId } from "@chanlytics/contracts";
import { reviewLinkOf } from "@chanlytics/db/campaigns";
import { readReviewAskFacts } from "@chanlytics/db/content";
import { listGoals } from "@chanlytics/db/files";
import type { Member } from "../shared/route";
import { recordDecision } from "../shared/verbs";
import type { RouteContext } from "../shared/with-route";

type Db = RouteContext["supabase"];

/** The plan's proposal of the review ask for a workspace now, or none. */
export async function readReviewAsk(db: Db, tenantId: TenantId, nowMs: number): Promise<ReviewAskDto | null> {
  const [goals, link, facts] = await Promise.all([
    listGoals(db, tenantId),
    reviewLinkOf(db, tenantId),
    readReviewAskFacts(db, tenantId),
  ]);
  return reviewAskOf({ goal: goals.some((g) => g.goal === "reviews"), reviewLink: link !== null, ...facts }, nowMs);
}

/** Not now: the proposal rests for 30 days, kept as the workspace's decision with when it comes back. */
export async function restReviewAsk(ctx: RouteContext, member: Member): Promise<{ rested_until: string }> {
  const until = new Date(Date.now() + REVIEW_ASK_REST_DAYS * DAY_MS).toISOString();
  await recordDecision(ctx, member.tenantId, "workspace", member.tenantId, "snooze", {
    about: "review_ask",
    until,
  });
  return { rested_until: until };
}
