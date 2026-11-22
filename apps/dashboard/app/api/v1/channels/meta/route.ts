import { read, workspace } from "@/server/shared/route";
import { readMeta } from "@/server/connections/meta";

/**
 * GET /api/v1/channels/meta — whether this workspace may connect Meta (the Meta link: the edge holds the app and reads
 * the workspace's switch), whether this member may press Connect, and how many posts wait for their time on Instagram
 * (a Disconnect's question says them). Settings › Connections draws the row from it.
 */
export const GET = read({
  scope: workspace,
  handle: ({ ctx, member }) => readMeta(ctx, member),
});
