import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { connections } from "@/server/readers/connections";

/**
 * GET /api/v1/setup — what the workspace has, for the Setup page.
 *
 * The assembly lives in src/server/setup.ts because it has a second caller:
 * the back office reads another workspace's through the same function, so
 * support sees exactly what the customer sees. Members read; the role rides
 * along so the page knows who may act. The body is its reader's
 * (readers/connections.ts).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), connections, undefined)).data,
});
