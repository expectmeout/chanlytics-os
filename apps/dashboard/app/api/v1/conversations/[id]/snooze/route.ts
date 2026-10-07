import { z } from "zod";
import { NEEDS_UNTIL, snooze } from "@chanlytics/core";
import { write } from "@/server/route";
import { conversationScope } from "@/server/verbs";
import { threadPorts } from "@/server/ports/core-ports";

/** Snooze: hide from the queue until a wake time. The receptionist stays active. */
export const POST = write({
  scope: conversationScope,
  role: "operator",
  rate: "thread_state",
  input: z.object({ until: z.string({ error: NEEDS_UNTIL }) }),
  handle: ({ ctx, row: conv, input }) => snooze(threadPorts(ctx), { conv, until: input.until }),
});
