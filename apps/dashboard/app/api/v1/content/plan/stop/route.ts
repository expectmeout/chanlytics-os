import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { stopWeekFor } from "@/server/content/plan";

/**
 * POST /api/v1/content/plan/stop — `{ plan_id }`: Stop it (00714; the content loop PRD's 12.4, canvas v18 board B5). A
 * week AI may approve, held to 8:00 AM, is let go: it waits for the owner's own press, as a week that asks does. Whoever
 * may approve a post. Answers `{ stopped: true }`.
 *
 * The handle is in src/server/content/plan.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.strictObject({ plan_id: z.uuid() }),
  handle: ({ ctx, input, member }) => stopWeekFor(ctx, member, input),
});
