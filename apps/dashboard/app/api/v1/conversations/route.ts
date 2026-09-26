import { z } from "zod";
import { AppError } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { load, readerContext } from "@/server/readers";
import { conversations } from "@/server/readers/conversations";

const Query = z.object({
  /**
   * These conversations, comma-separated, instead of the newest hundred: the escalated threads the page has not
   * loaded. It read them one by one, the first twenty only, and the twenty-first waiting customer vanished (I5).
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
    const asked = input.ids
      ? [
          ...new Set(
            input.ids
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        ]
      : null;
    if (asked && asked.length > IDS_MAX)
      throw new AppError("validation", `Ask for at most ${IDS_MAX} conversations at once.`);
    for (const id of asked ?? []) requireUuid(id, "conversation");
    return (await load(readerContext(ctx, member), conversations, { ids: asked })).data;
  },
});
