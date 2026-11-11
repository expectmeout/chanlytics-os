import { z } from "zod";
import { VISITS_KEPT_MAX } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { markVisitsKeptOf } from "@/server/calendar/visits";

/**
 * POST /api/v1/calendar/visits/kept — `{ ids }`: Today's Mark all kept. Each visit named is said kept through the door one
 * press goes through (00397 mark_visit), so each keeps its rules and its decision, and raises the event a single Kept
 * raises (decision 0123: the thank-you the day after waits for it). Answers how many moved, how many were kept already,
 * how many were refused and the first one's sentence, and what the word sets going. An operator or above, as a single
 * Kept is; a visit the caller cannot see is refused, never told apart from one that is not there.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "person_edit",
  input: z.object({ ids: z.array(z.uuid()).min(1).max(VISITS_KEPT_MAX) }).strict(),
  handle: ({ ctx, input, member }) => markVisitsKeptOf(ctx, member.tenantId, input.ids),
});
