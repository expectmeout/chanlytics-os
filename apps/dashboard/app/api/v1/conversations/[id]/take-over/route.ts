import { takeOver } from "@chanlytics/core";
import { write } from "@/server/shared/route";
import { conversationScope } from "@/server/shared/verbs";
import { threadPorts } from "@/server/conversations/ports";

/** Take over: pause the receptionist, claim the thread. The open escalation stays open (§4). */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "thread_state",
  handle: ({ ctx, row: conv }) => takeOver(threadPorts(ctx), { conv }),
});
