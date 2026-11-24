import { z } from "zod";
import { DAY_KEY } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { approveWeekFor } from "@/server/content/plan";

/**
 * POST /api/v1/content/plan/approve — `{ plan_id, week_of }`: Approve the week (00706; the content loop PRD's 8.4, canvas
 * call 10). Every slot ready, as the Week shows it, goes under one approval of the plan; a slot whose reason no longer
 * stands is left out and said, and a blocked one or one asking for footage stays as it is and asks by itself once mended.
 * Whoever may approve a post. Answers `{ approved, left_out: [{ id, why }] }`.
 *
 * The handle is in src/server/content/plan.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.strictObject({ plan_id: z.uuid(), week_of: z.string().regex(DAY_KEY) }),
  handle: ({ ctx, input, member }) => approveWeekFor(ctx, member, input),
});
