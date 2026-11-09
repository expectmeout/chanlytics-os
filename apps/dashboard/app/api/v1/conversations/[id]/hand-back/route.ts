import { handBack } from "@chanlytics/core";
import { write } from "@/server/shared/route";
import { conversationScope } from "@/server/shared/verbs";
import { threadPorts } from "@/server/conversations/ports";

/** Hand back: the receptionist resumes; the open escalation resolves (§4). */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "thread_state",
  handle: ({ ctx, row: conv }) => handBack(threadPorts(ctx), { conv }),
});
