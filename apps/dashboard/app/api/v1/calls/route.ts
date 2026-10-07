import { z } from "zod";
import { read, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { load, readerContext } from "@/server/readers";
import { calls } from "@/server/readers/calls";

const Query = z.object({
  /** Narrow to one thread's calls. */
  conversation_id: z.string().optional(),
  /** Narrow to one lifecycle state. */
  status: z.string().optional(),
});

/**
 * GET /api/v1/calls — one workspace's phone calls, newest first, narrowed to
 * one thread or one lifecycle state when asked. The recording's storage path
 * and provider URL never leave the server (CALL_COLUMNS, toCallDto): audio is
 * reachable only through /api/v1/calls/:id/recording, a five-minute signed URL.
 */
export const GET = read({
  scope: workspace,
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const conversationId = input.conversation_id ? requireUuid(input.conversation_id, "conversation") : undefined;
    return (await load(readerContext(ctx, member), calls, { conversationId, status: input.status })).data;
  },
});
