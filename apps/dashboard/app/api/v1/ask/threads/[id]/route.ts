import { AppError } from "@chanlytics/contracts";
import { read, write, account } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { deleteThread, readThread } from "@/server/ask/store";

/**
 * One of the caller's own Ask threads. The thread is the person's, not the
 * workspace's: RLS is the door, so both are declared on the account — no
 * workspace resolved, no role judged, exactly as they always were.
 */

/** GET /api/v1/ask/threads/:id — one of the caller's own threads with its turns. */
export const GET = read({
  scope: account,
  handle: async ({ ctx }) => {
    const id = requireUuid(ctx.params.id, "thread");
    const found = await readThread(ctx, id);
    if (!found) throw new AppError("not_found", "That thread is not yours or is already gone.", 404);
    return { thread: found.thread, messages: found.messages };
  },
});

/** DELETE /api/v1/ask/threads/:id — gone for good; the turns go with it. */
export const DELETE = write({
  scope: account,
  role: null,
  rate: null,
  handle: async ({ ctx }) => {
    const id = requireUuid(ctx.params.id, "thread");
    await deleteThread(ctx, id);
    return { deleted: id };
  },
});
