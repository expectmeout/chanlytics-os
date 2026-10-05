import { read, workspace } from "@/server/route";
import { exportConversation } from "@/server/export/conversation-export";

/**
 * GET /api/v1/conversations/:id/export — the whole thread as a text file,
 * not the screen's page: every message, oldest first, for the business's
 * own records. Any member, in the workspace the tab named, ten a minute.
 *
 * The handle is exportConversation in src/server/export/conversation-export.ts: the route is its declaration (who may,
 * how often), the verb is what it does.
 */
export const GET = read({
  scope: workspace,
  rate: "export",
  handle: ({ ctx, member }) => exportConversation(ctx, member),
});
