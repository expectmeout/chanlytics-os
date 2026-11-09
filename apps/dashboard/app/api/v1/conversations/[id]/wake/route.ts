import { wake } from "@chanlytics/core";
import { write } from "@/server/shared/route";
import { conversationScope } from "@/server/shared/verbs";
import { threadPorts } from "@/server/conversations/ports";

/** Wake now: end a snooze early and put the thread back exactly as it was. */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "thread_state",
  handle: ({ ctx, row: conv }) => wake(threadPorts(ctx), { conv }),
});
