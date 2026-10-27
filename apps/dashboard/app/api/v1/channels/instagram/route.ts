import { read, workspace } from "@/server/route";
import { readInstagram } from "@/server/connections/instagram";

/**
 * GET /api/v1/channels/instagram — whether this deployment can connect an Instagram account (the edge holds the app:
 * decision 0001, step 8), and whether this member may press Connect. Settings › Connections draws the row from it.
 */
export const GET = read({
  scope: workspace,
  handle: ({ member }) => readInstagram(member),
});
