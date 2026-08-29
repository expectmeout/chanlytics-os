import { withRoute, memberContext } from "@/server/with-route";
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
    .select("id, state, paused_until, snooze_until, assignee_user_id, last_wa_inbound_at, last_message_at, contacts (id, display_name, wa_profile_name, phone_e164, consent, dnc)")
    .eq("tenant_id", tenantId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) throw new Error(error.message);

  const ids = (convs ?? []).map((c) => c.id);
  const byConv = new Map<string, MessageDto[]>();
  if (ids.length) {
    // Newest-first fetch: when the global cap bites, it drops the OLDEST
    // history, never a thread's most recent messages.
    const { data: msgs, error: merr } = await supabase
      .from("messages")
      .select("id, conversation_id, direction, sender, type, body, media, meta, status, created_at, channel_ts")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(4000);
    if (merr) throw new Error(merr.message);
    for (const m of msgs ?? []) {
      const list = byConv.get(m.conversation_id) ?? [];
      // rows arrive newest-first; unshift restores ascending per conversation
      list.unshift({
        id: m.id,
        direction: m.direction as MessageDto["direction"],
        sender: m.sender as MessageDto["sender"],
        type: m.type,
        body: m.body,
        media: m.media as MessageDto["media"],
        meta: m.meta as MessageDto["meta"],
        status: m.status,
        created_at: m.created_at,
        channel_ts: m.channel_ts,
      });
      byConv.set(m.conversation_id, list);
    }
  }

  const conversations: ConversationDto[] = (convs ?? []).map((c) => ({
    id: c.id,
    state: c.state as ConversationDto["state"],
    paused_until: c.paused_until,
    snooze_until: c.snooze_until,
    assignee_user_id: c.assignee_user_id,
    assignee_is_me: c.assignee_user_id ? c.assignee_user_id === userId : undefined,
    last_wa_inbound_at: c.last_wa_inbound_at,
    last_message_at: c.last_message_at,
    contact: {
      id: c.contacts?.id ?? "",
      display_name: c.contacts?.display_name ?? null,
      wa_profile_name: c.contacts?.wa_profile_name ?? null,
      phone_e164: c.contacts?.phone_e164 ?? null,
      consent: c.contacts?.consent ?? null,
      dnc: c.contacts?.dnc ?? false,
    },
    messages: byConv.get(c.id) ?? [],
  }));
  return { conversations };
});
