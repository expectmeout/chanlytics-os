import { REPLY_DRAFTS_IDS_MAX, ReplyDraftsQuerySchema } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { requireUuidList } from "@/server/request-guards";
import { draftsKept } from "@/server/conversations/drafts";

/**
 * GET /api/v1/conversations/drafts?ids=a,b — the drafts Ask kept on these threads (decision 0071, 00475): Today's rows
 * read them as they draw, and ask POST conversations/:id/draft for one that is missing or answers an older message. With
 * no `ids`, the workspace's newest and whether they are all it keeps: Today reads that with its own first reads, before
 * it knows its rows, so each row draws with its words. RLS keeps the read to the workspace; a viewer reads them as the
 * rows show them, and sends nothing.
 */
export const GET = read({
  scope: workspace,
  query: ReplyDraftsQuerySchema,
  handle: ({ ctx, member, input }) =>
    draftsKept(
      ctx,
      member,
      input.ids === undefined ? null : (requireUuidList(input.ids, "conversation", REPLY_DRAFTS_IDS_MAX) ?? []),
    ),
});
