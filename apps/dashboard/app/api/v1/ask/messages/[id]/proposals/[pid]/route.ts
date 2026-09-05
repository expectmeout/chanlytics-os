import { AppError, AskProposalOutcomeSchema } from "@chanlytics/contracts";
import { withRoute } from "@/server/with-route";
import { requireUuid } from "@/server/request-guards";
import { setProposalOutcome } from "@/server/ask/store";

/**
 * POST /api/v1/ask/messages/:id/proposals/:pid — what became of a card.
 *
 * The commit itself went through the verb's own route (reply, steer, take
 * over, settings…), which checked the role and the state. This records the
 * result on the turn that proposed it, so the thread reads back with "Sent"
 * or "Not now" instead of a fresh Approve. Own rows only (RLS), one column
 * (00041), and a card approved once cannot be marked approved again.
 */
export const POST = withRoute(async (req, ctx) => {
  const id = requireUuid(ctx.params.id, "turn");
  const pid = typeof ctx.params.pid === "string" ? ctx.params.pid.slice(0, 40) : "";
  if (!/^p-[a-z0-9-]+$/.test(pid)) throw new AppError("validation", "Which card?");
  const body = await req.json().catch(() => null);
  const parsed = AskProposalOutcomeSchema.safeParse(body);
  if (!parsed.success) throw new AppError("validation", "An outcome is { state, receipt, atMs, undo? }.");
  const proposal = await setProposalOutcome(ctx, id, pid, { ...parsed.data, atMs: parsed.data.atMs || Date.now() });
  return { proposal };
});
