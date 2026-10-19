import { z } from "zod";
import { read, workspace } from "@/server/route";
import { requireUuid, requireUuidList } from "@/server/request-guards";
import { load, readerContext } from "@/server/readers";
import { calls } from "@/server/readers/calls";

/** The longest a search may be. */
const SEARCH_MAX = 100;

const Query = z.object({
  /** Narrow to one thread's calls. */
  conversation_id: z.string().optional(),
  /** Narrow to one lifecycle state. */
  status: z.string().optional(),
  /**
   * These calls, comma-separated, instead of the newest hundred: the one a link names that is older than those (a bell
   * row from last week, an Activity line, a person's page), read by its id (finding A2c of the wiring plan).
   */
  ids: z.string().optional(),
  /** Only the calls whose transcript says these words: Conversations' search box, over every call's words (18 Oct 2026). */
  q: z.string().max(SEARCH_MAX).optional(),
});

/** The most calls one read may name. */
const IDS_MAX = 100;

/**
 * GET /api/v1/calls — one workspace's phone calls, newest first, narrowed to
 * one thread, one lifecycle state, the calls whose transcript says `q`, or the
 * calls `ids` names when asked. The recording's storage path and provider URL
 * never leave the server (CALL_COLUMNS, toCallDto): audio is reachable only
 * through /api/v1/calls/:id/recording, a five-minute signed URL. A list leaves
 * an ended call's turns on the server (dto.ts listedCall); a call read by its
 * id comes whole, which is how its card reads them as it opens.
 */
export const GET = read({
  scope: workspace,
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const conversationId = input.conversation_id ? requireUuid(input.conversation_id, "conversation") : undefined;
    const ids = requireUuidList(input.ids, "call", IDS_MAX) ?? undefined;
    const q = input.q?.trim() || undefined;
    return (
      await load(readerContext(ctx, member), calls, { conversationId, status: input.status, ids, q, listed: !ids })
    ).data;
  },
});
