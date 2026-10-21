import { write, workspace } from "@/server/route";
import { readerContext } from "@/server/readers";
import { DRAFT_BODY } from "@/server/sequences/bodies";
import { draftSequence } from "@/server/sequences/draft";

/**
 * POST /api/v1/sequences/draft — { words, kind?, audience?, who?, previous? } → what New makes, drafted by Ask (decision
 * 0065) from the owner's own line: a sequence or a message sent once, to people or to leads, who it is for and when, and
 * each step with its wait, what must still hold and what it does (a message the workspace holds, one Ask wrote, a lead's
 * own email, or a call or a note), with what Ask checked and what the line asked that nothing here can do (`cannot`). A
 * choice already made (`kind`, `audience`, `who`) is kept. A draft, never a sequence: the owner keeps it as a draft or
 * starts it (POST sequences). Owner or operator; counted against the workspace's assistant budget like any other
 * assistant turn.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "ask",
  input: DRAFT_BODY,
  handle: ({ ctx, member, input }) => draftSequence(readerContext(ctx, member), input),
});
