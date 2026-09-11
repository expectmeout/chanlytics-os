import { read, workspace } from "@/server/route";
import { setupDtoFor } from "@/server/setup";

/**
 * GET /api/v1/setup — what the workspace has, for the Setup page.
 *
 * The assembly lives in src/server/setup.ts because it has a second caller:
 * the back office reads another workspace's through the same function, so
 * support sees exactly what the customer sees. Members read; the role rides
 * along so the page knows who may act.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const setup = await setupDtoFor(ctx.supabase, member.tenantId, { kind: "member" });
    return { setup, role: member.role };
  },
});
