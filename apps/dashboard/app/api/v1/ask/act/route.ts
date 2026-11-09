import { write, workspace } from "@/server/shared/route";
import { ACT_INPUT, actOf, runAct } from "@/server/ask/act/run";

/**
 * POST /api/v1/ask/act — a card acted on (D15 of the answers canvas). Body { message_id, proposal_id, by? }. The card is read
 * from the member's own turn, read again for what has moved, then walked through each verb's own route under the member's own
 * session, so every door judges it as it would from a browser; what became of it is kept on the turn and in ask_actions.
 *
 * An operator's door, as approving is: a role below that is refused here, and a kind above it is refused by its own route.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "settings",
  input: ACT_INPUT,
  handle: ({ ctx, req, member, input }) => runAct(ctx, req, member, actOf(input)),
});

/** A plan's press may make several calls, one of which may file a message with WhatsApp. */
export const maxDuration = 60;
