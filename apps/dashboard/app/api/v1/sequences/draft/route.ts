import { write, workspace } from "@/server/route";
import { readerContext } from "@/server/readers";
import { DRAFT_BODY } from "@/server/sequences/bodies";
import { draftSequence } from "@/server/sequences/draft";

/**
 * POST /api/v1/sequences/draft — { words, previous?, list? } → a new sequence drafted by Ask (decision 0060, S4: New) from the
 * owner's own line: its name, the moment that starts it, its hour and its steps, each a message this workspace can send
 * now with its values, and after the first a wait and what must still hold; with what the line asked that no moment or
 * message here can do (`cannot`). A draft, never a sequence: the owner keeps it as a draft or starts it (POST sequences).
 * `previous` is the draft said again; `list` the list it starts on, in place of a moment. Owner or operator; counted against the workspace's assistant budget like any other
 * assistant turn.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "ask",
  input: DRAFT_BODY,
  handle: ({ ctx, member, input }) =>
    draftSequence(readerContext(ctx, member), input.words, input.previous ?? null, input.list ?? null),
});
