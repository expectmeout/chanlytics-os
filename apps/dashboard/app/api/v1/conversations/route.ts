import { read, workspace } from "@/server/route";
import { CONVERSATION_COLUMNS, MESSAGE_COLUMNS, groupMessages, toConversationDto } from "@/server/dto";
import type { ConversationDto, MessageDto } from "@chanlytics/contracts";

/**
 * GET /api/v1/conversations — the Inbox: the hundred most recent
 * conversations of the workspace with their recent messages, as the page
 * draws them. RLS scopes the rows; the workspace is the one the tab named.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const { supabase, userId } = ctx;
    const tenantId = member.tenantId;
    const { data: convs, error } = await supabase
      .from("conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const ids = (convs ?? []).map((c) => c.id);
    let byConv = new Map<string, MessageDto[]>();
    if (ids.length) {
      const { data: msgs, error: merr } = await supabase
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(4000);
      if (merr) throw new Error(merr.message);
      byConv = groupMessages(msgs ?? []);
    }
    const conversations: ConversationDto[] = (convs ?? []).map((c) =>
      toConversationDto(c, byConv.get(c.id) ?? [], userId),
    );
    return { conversations };
  },
});
