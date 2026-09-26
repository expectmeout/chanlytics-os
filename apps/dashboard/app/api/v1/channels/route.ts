import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { channels } from "@/server/readers/channels";

/**
 * GET /api/v1/channels — the workspace's channels as the page may see them:
 * each row, when it last heard from a customer, and the quality Meta has
 * assigned the WhatsApp number (kept on the row's config by the edge). The
 * body is its reader's (readers/channels.ts), which Ask reads too.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), channels, undefined)).data,
});
