import { write, workspace } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";
import { actBody, undoAct } from "@/server/ask/act/run";

/**
 * POST /api/v1/ask/act/undo — a card taken back (D15 of the answers canvas). Body { message_id, proposal_id }. What its commit
 * kept goes through its spec's own way back, under the member's own session, and the turn and its record say so.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  handle: async ({ ctx, req, member }) => {
    const input = actBody(await req.json().catch(() => null));
    requireUuid(input.messageId, "turn");
    return undoAct(ctx, req, member, input);
  },
});

export const maxDuration = 60;
