import { archive } from "@chanlytics/core";
import { write } from "@/server/route";
import { conversationScope } from "@/server/verbs";
import { threadPorts } from "@/server/ports/core-ports";

/** Archive: close the thread (a state, never a deletion — P3). */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "thread_state",
  handle: ({ ctx, row: conv }) => archive(threadPorts(ctx), { conv }),
});
