import { withRoute, memberContext } from "@/server/with-route";
import { listThreads } from "@/server/ask/store";

/** GET /api/v1/ask/threads — the caller's own Ask threads in this workspace, newest first. */
export const GET = withRoute(async (req, ctx) => {
  const { tenantId } = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  return { threads: await listThreads(ctx, tenantId) };
});
