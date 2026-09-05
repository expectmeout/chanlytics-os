import { AppError } from "@chanlytics/contracts";
import { withRoute } from "@/server/with-route";
import { requireUuid } from "@/server/request-guards";
import { deleteThread, readThread } from "@/server/ask/store";

/** GET /api/v1/ask/threads/:id — one of the caller's own threads with its turns. */
export const GET = withRoute(async (_req, ctx) => {
  const id = requireUuid(ctx.params.id, "thread");
  const found = await readThread(ctx, id);
  if (!found) throw new AppError("not_found", "That thread is not yours or is already gone.", 404);
  return { thread: found.thread, messages: found.messages };
});

/** DELETE /api/v1/ask/threads/:id — gone for good; the turns go with it. */
export const DELETE = withRoute(async (_req, ctx) => {
  const id = requireUuid(ctx.params.id, "thread");
  await deleteThread(ctx, id);
  return { deleted: id };
});
