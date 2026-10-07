import { z } from "zod";
import { read } from "@/server/route";
import { conversationScope } from "@/server/verbs";
import { load, readerContext } from "@/server/readers";
import { conversationDtoOf, messagesOf } from "@/server/readers/conversation";

const Query = z.object({
  /** Page back: messages created before this instant. */
  // Refused here rather than handed to PostgREST as a timestamp: an unparseable
  // value comes back as 22P02, which is not an AppError, so withRoute renders a
  // client's typo as a 500 "Something went wrong" -- the exact failure
  // requireUuid exists to prevent for ids.
  before: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "before must be a timestamp.")
    .optional(),
});

/**
 * GET /api/v1/conversations/:id?before= — one thread and its most recent
 * hundred messages (older ones by paging back). The conversation is the row
 * (conversationScope): read under RLS, so one the caller cannot see is a
 * 404, and any member of the workspace it lives in may read it.
 */
export const GET = read({
  scope: conversationScope,
  query: Query,
  handle: async ({ ctx, row, input, member }) => {
    // `row` IS the conversation: conversationScope loaded it under RLS a moment
    // ago and 404s when it is not there. This re-read the same row through the
    // same join for five more columns, doubling the round trips on the Inbox's
    // hottest read -- and its own `if (!conv) 404` could never fire. The five
    // columns ride on loadConversation now, and the reader reads the messages
    // alone (readers/conversation.ts).
    const rc = readerContext(ctx, member);
    const messages = (await load(rc, messagesOf, { id: row.id, before: input.before ?? null })).data;
    return { conversation: conversationDtoOf(row, ctx.userId), messages };
  },
});
