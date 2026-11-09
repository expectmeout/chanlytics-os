import { ReplyDraftAskSchema } from "@chanlytics/contracts";
import { write } from "@/server/shared/route";
import { conversationScope } from "@/server/shared/verbs";
import { draftForThread } from "@/server/conversations/drafts";

/** A model call at the edge, with the member waiting: the platform's ceiling, as the door's own. */
export const maxDuration = 60;

/**
 * POST /api/v1/conversations/:id/draft — { kind: "reply" | "brief", instruction?: string }
 *
 * A member's Try again on a thread's draft, or with `instruction` (280 characters at most) their change to the kept one
 * (decision 0093). A first draft is written when the thread's hold owes it, with nobody asking; this is the member waiting,
 * through the edge's door, in the same words every page hears. Nothing is sent: the reply goes through POST
 * conversations/:id/reply on a press. An operator or above, as a reply is.
 */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "person_draft",
  input: ReplyDraftAskSchema,
  handle: ({ ctx, row, member, input }) => draftForThread(ctx, member, row, input),
});
