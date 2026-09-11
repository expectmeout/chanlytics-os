import { read, workspace } from "@/server/route";
import { listThreads } from "@/server/ask/store";

/** GET /api/v1/ask/threads — the caller's own Ask threads in this workspace, newest first. */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => ({ threads: await listThreads(ctx, member.tenantId) }),
});
