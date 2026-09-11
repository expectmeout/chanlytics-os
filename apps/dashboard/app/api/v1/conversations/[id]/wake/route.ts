import { wake } from "@chanlytics/core";
import { write } from "@/server/route";
import { conversationScope } from "@/server/verbs";
import { threadPorts } from "@/server/core-ports";

/** Wake now: end a snooze early and put the thread back exactly as it was. */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "thread_state",
  handle: ({ ctx, row: conv }) => wake(threadPorts(ctx), { conv }),
});
