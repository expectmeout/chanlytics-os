import { replyAnyway } from "@chanlytics/core";
import { write } from "@/server/shared/route";
import { conversationScope } from "@/server/shared/verbs";
import { threadPorts } from "@/server/conversations/ports";

/**
 * Reply anyway, on a thread set aside (decision 0093): a customer's after all. Open again, its sender a person, its hold back
 * with its first reason, and so a draft owed. A member who acts, as a hand-back is.
 */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "thread_state",
  handle: ({ ctx, row: conv }) => replyAnyway(threadPorts(ctx), { conv }),
});
