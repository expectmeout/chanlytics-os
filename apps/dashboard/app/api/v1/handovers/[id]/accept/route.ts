import { write, account } from "@/server/route";
import { acceptHandoverOf } from "@/server/workspace/handover-answer";

/**
 * POST /api/v1/handovers/:id/accept — the caller, by the confirmed address a workspace was handed to (decision 0016),
 * becomes its owner (00214 handover_accept): billing, the team, and the partner who set it up beside them on it.
 * Never the partner themselves; never after it was declined or expired. On the account: the caller is not yet a
 * member of the workspace they are accepting.
 *
 * The handle is acceptHandoverOf in src/server/workspace/handover-answer.ts: the route is its declaration (who may, how
 * often), the verb is what it does.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "handover_answer",
  fresh: true,
  handle: ({ ctx }) => acceptHandoverOf(ctx),
});
