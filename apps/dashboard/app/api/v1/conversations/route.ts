import { z } from "zod";
import { read, workspace } from "@/server/route";
import { requireUuidList } from "@/server/request-guards";
import { load, readerContext } from "@/server/readers";
import { conversations } from "@/server/readers/conversations";

/** The longest a search may be: GET calls' own. */
const SEARCH_MAX = 100;

const Query = z.object({
  /**
   * These conversations, comma-separated, instead of the newest hundred: the escalated threads the page has not
   * loaded, and the one a link names. It read them one by one, the first twenty only, and the twenty-first waiting
   * customer vanished (I5).
   */
  ids: z.string().optional(),
  /**
   * Only the conversations whose messages say these words: Conversations' search box, over every thread's words, as GET
   * calls' `q` is over every call's. The box matched only the messages the Inbox's read carried, a thread's newest.
   */
  q: z.string().max(SEARCH_MAX).optional(),
});

/** The most conversations one read may name. */
const IDS_MAX = 100;

/**
 * GET /api/v1/conversations — the Inbox: the hundred most recent
 * conversations of the workspace with their newest messages, as the page
 * draws them, or the ones `ids` names, or the ones whose messages say `q`.
 * RLS scopes the rows; the workspace is the one the tab named.
 */
export const GET = read({
  scope: workspace,
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const asked = requireUuidList(input.ids, "conversation", IDS_MAX);
    const said = input.q?.trim() || null;
    return (await load(readerContext(ctx, member), conversations, { ids: asked, said })).data;
  },
});
