import { z } from "zod";
import { DAY_KEY } from "@chanlytics/contracts";
import { read, write, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { contentPlan } from "@/server/readers/content/plan";
import { askPlanFor } from "@/server/content/plan";

/**
 * GET /api/v1/content/plan — the Week (00706; the content loop PRD's 21.2): the plan of a week with its slots in time
 * order, what the owner claims, what the posts are for, and how often they go up. `?week=` names the Monday; left out, the
 * week to plan now (this one, or the next from Sunday evening). Every member reads it. The body is its reader's
 * (readers/plan.ts).
 *
 * POST — `{ week_of? }`: "plan the week" now. The week drafts with nothing made, ready in a few minutes; a week already
 * approved stays as it is. Whoever may approve a post. Answers `{ drafting, plan_id, week_of }`.
 *
 * The handle is in src/server/content/plan.ts.
 */
export const GET = read({
  scope: workspace,
  query: z.object({ week: z.string().regex(DAY_KEY).optional() }),
  handle: async ({ ctx, member, input }) => (await load(readerContext(ctx, member), contentPlan, input)).data,
});

export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.strictObject({ week_of: z.string().regex(DAY_KEY).optional() }),
  handle: ({ ctx, input, member }) => askPlanFor(ctx, member, input),
});
