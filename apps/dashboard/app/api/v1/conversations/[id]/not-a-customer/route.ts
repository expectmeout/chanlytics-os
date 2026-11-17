import { markNotACustomer } from "@chanlytics/core";
import { z } from "zod";
import { write } from "@/server/shared/route";
import { conversationScope } from "@/server/shared/verbs";
import { threadPorts } from "@/server/conversations/ports";

/**
 * Not a customer, on a thread set aside (decision 0093): off the list, still archived, its sender's address automated, and
 * with `undo` all of it back. Said of a thread that still asks for someone (decision 0136), it is set aside first, its
 * hold resolved, and its person's later calls ask nobody for a call back; Reply anyway takes that back. A member who
 * acts, as a hand-back is.
 */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "thread_state",
  input: z.object({ undo: z.boolean().default(false) }),
  handle: ({ ctx, row: conv, input }) => markNotACustomer(threadPorts(ctx), { conv, undo: input.undo }),
});
