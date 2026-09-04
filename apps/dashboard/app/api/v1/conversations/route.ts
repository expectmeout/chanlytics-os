import { withRoute, memberContext } from "@/server/with-route";
import { CONVERSATION_COLUMNS, MESSAGE_COLUMNS, groupMessages, toConversationDto } from "@/server/dto";
import type { ConversationDto, MessageDto } from "@chanlytics/contracts";

/**
 * GET /api/v1/conversations — ONE workspace's threads with their transcripts.
 *
 * Scoped explicitly to the active workspace, not merely RLS-scoped. RLS answers
 * "may this caller see this row", and for someone who belongs to two workspaces
 * the answer is yes to both — so this endpoint used to return two businesses'
 * customers interleaved in one inbox, with nothing in the payload saying which
 * was which. RLS stays the floor; the tenant filter is what makes the list mean
 * something.
 *
 * Pilot scale: one list query + one IN query; pagination arrives with volume.
 */
export const GET = withRoute(async (req, ctx) => {
  const { supabase, userId } = ctx;
  const { tenantId } = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
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
    // Newest-first fetch: when the global cap bites, it drops the OLDEST
    // history, never a thread's most recent messages.
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
});
