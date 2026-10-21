import { write, workspace } from "@/server/route";
import { NEW_MAKE_BODY } from "@/server/sequences/bodies";
import { makeFromNew } from "@/server/sequences/new-make";

/**
 * POST /api/v1/sequences/new — New's draft, kept (`start` false) or started (decision 0065): a sequence or a message sent
 * once, to people or to leads. A message Ask wrote is filed first (its email and text approved at once, its WhatsApp
 * version sent to Meta); then the sequence is made through POST sequences' own door, or the one-off through the send
 * screen's (core createBroadcast), or kept under Drafts. Answers what was made, its kind and its state, and when a
 * one-off goes. Owner or operator, at a send's rate (POST broadcasts'), since a one-off sent here is a send.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "broadcast",
  input: NEW_MAKE_BODY,
  handle: ({ ctx, member, input }) => makeFromNew(ctx, member, input),
});
