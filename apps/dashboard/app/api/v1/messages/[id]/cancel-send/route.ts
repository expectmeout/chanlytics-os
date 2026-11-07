import { cancelSend } from "@chanlytics/core";
import { write } from "@/server/shared/route";
import { cancelSendPorts } from "@/server/conversations/ports";
import { theMessage } from "@/server/conversations/held-message";

/** The honest undo (§6): inside the grace window a queued send cancels cleanly; after fire it is out, and this says so. */
export const POST = write({
  scope: theMessage,
  role: "operator",
  rate: "thread_state",
  handle: ({ ctx, row: msg }) => cancelSend(cancelSendPorts(ctx), { msg }),
});
