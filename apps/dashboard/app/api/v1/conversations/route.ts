import { z } from "zod";
import { read, workspace } from "@/server/route";
import { requireUuidList } from "@/server/request-guards";
import { load, readerContext } from "@/server/readers";
import { conversations } from "@/server/readers/conversations";

const Query = z.object({
  /**
   * These conversations, comma-separated, instead of the newest hundred: the escalated threads the page has not
   * loaded, and the one a link names. It read them one by one, the first twenty only, and the twenty-first waiting
   * customer vanished (I5).
   */
  ids: z.string().optional(),
});

/** The most conversations one read may name. */
const IDS_MAX = 100;

/**
 * GET /api/v1/conversations — the Inbox: the hundred most recent
 * conversations of the workspace with their recent messages, as the page
 * draws them, or the ones `ids` names. RLS scopes the rows; the workspace is
 * the one the tab named.
 */
export const GET = read({
  scope: workspace,
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const asked = requireUuidList(input.ids, "conversation", IDS_MAX);
    return (await load(readerContext(ctx, member), conversations, { ids: asked })).data;
  },
});
