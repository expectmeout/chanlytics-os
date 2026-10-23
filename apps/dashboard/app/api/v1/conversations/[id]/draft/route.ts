import { ReplyDraftAskSchema } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { conversationScope } from "@/server/verbs";
import { draftForThread } from "@/server/conversations/drafts";

/** A model call that reads the person first: the platform's ceiling, as the person draft's own route. */
export const maxDuration = 60;

/**
 * POST /api/v1/conversations/:id/draft — { kind: "reply" | "brief" }
 *
 * Ask's draft for a thread waiting on a person (decision 0071): a reply to what they wrote last, or the brief for a call
 * back, written once by the person draft (a model call, in Ask's one daily budget and the person draft's own bucket) and
 * kept on the thread until they write again (00475), so the next read, any tab's or any teammate's, is the same words.
 * Nothing is sent: the reply goes through POST conversations/:id/reply on a press. An operator or above, as a reply is.
 */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "person_draft",
  input: ReplyDraftAskSchema,
  handle: ({ ctx, row, member, input }) => draftForThread(ctx, member, row, input.kind),
});
