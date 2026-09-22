import { z } from "zod";
import { AppError } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { CONVERSATION_COLUMNS, MESSAGE_COLUMNS, groupMessages, toConversationDto, type MessageRow } from "@/server/dto";
import type { ConversationDto, MessageDto } from "@chanlytics/contracts";

const Query = z.object({
  /**
   * These conversations, comma-separated, instead of the newest hundred: the escalated threads the page has not
   * loaded. It read them one by one, the first twenty only, and the twenty-first waiting customer vanished (I5).
   */
  ids: z.string().optional(),
});

/** The most rows PostgREST answers for one select (supabase config max_rows): a longer read pages. */
const PAGE = 1000;
/** The Inbox's messages across the threads it shows, newest first. */
const MESSAGES_MAX = 4000;
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
    const { supabase, userId } = ctx;
    const tenantId = member.tenantId;
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
    const base = supabase.from("conversations").select(CONVERSATION_COLUMNS).eq("tenant_id", tenantId);
    const { data: convs, error } = await (asked
      ? base.in("id", asked)
      : base.order("last_message_at", { ascending: false, nullsFirst: false }).limit(100));
    if (error) throw new Error(error.message);
    const ids = (convs ?? []).map((c) => c.id);
    let byConv = new Map<string, MessageDto[]>();
    if (ids.length) {
      // Paged: PostgREST answers a thousand rows whatever a select asks for, so .limit(4000) read 1,000 and the
      // older threads came back with no messages, reading "No messages yet" (I5). The id breaks ties, so a page
      // boundary neither repeats a message nor skips one.
      const rows: MessageRow[] = [];
      for (let from = 0; from < MESSAGES_MAX; from += PAGE) {
        const { data: page, error: merr } = await supabase
          .from("messages")
          .select(MESSAGE_COLUMNS)
          .in("conversation_id", ids)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, Math.min(from + PAGE, MESSAGES_MAX) - 1);
        if (merr) throw new Error(merr.message);
        rows.push(...((page ?? []) as MessageRow[]));
        if ((page ?? []).length < PAGE) break;
      }
      byConv = groupMessages(rows);
    }
    const conversations: ConversationDto[] = (convs ?? []).map((c) =>
      toConversationDto(c, byConv.get(c.id) ?? [], userId),
    );
    return { conversations };
  },
});
