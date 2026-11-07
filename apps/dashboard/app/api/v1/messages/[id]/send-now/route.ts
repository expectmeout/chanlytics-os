import { releaseHeldReply } from "@chanlytics/core";
import { write } from "@/server/shared/route";
import { sendNowPorts } from "@/server/conversations/ports";
import { theMessage } from "@/server/conversations/held-message";

/** A held reply let go now (the thread canvas's Send now): its send job brought to the ledger's next tick. */
export const POST = write({
  scope: theMessage,
  role: "operator",
  rate: "thread_state",
  handle: ({ ctx, row: msg }) => releaseHeldReply(sendNowPorts(ctx), { msg }),
});
