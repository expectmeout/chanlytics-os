import { write } from "@/server/route";
import { callScope } from "@/server/verbs";
import { passCallToOwnerLine } from "@/server/conversations/call-hand-over";

/**
 * POST /api/v1/calls/:id/hand-over — pass a call in progress to the
 * business's own line. The receptionist is told the owner is picking up and
 * transfers the caller with the tool it already has; the owner's phone rings,
 * the way it does when a caller asks for a person. The call is the row
 * (callScope): visible under RLS first, then the role judged where the call
 * lives, then the line the workspace has (none is said plainly, with the
 * fix), then the provider, and the decision recorded last — take_over, the
 * verb the Inbox uses for the same intent on a thread.
 *
 * The handle is passCallToOwnerLine in src/server/conversations/call-hand-over.ts: the route is its declaration (who
 * may, how often), the verb is what it does.
 */
export const POST = write({
  scope: callScope,
  role: "operator",
  rate: "call_control",
  handle: ({ ctx, row: call }) => passCallToOwnerLine(ctx, call),
});
