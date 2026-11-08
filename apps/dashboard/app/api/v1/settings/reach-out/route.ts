import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { reachOutSettings } from "@/server/readers/settings";

/**
 * GET /api/v1/settings/reach-out — what How it reaches out shows beyond the config (decision 0113): the mailbox as
 * Connections says it, the month's first emails, each claim's count, the lines Ask learned from how the owner writes,
 * the newest running sequence to leads, and Autonomy's reply mode. Members read; RLS scopes. The body is its reader's.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), reachOutSettings, undefined)).data,
});
