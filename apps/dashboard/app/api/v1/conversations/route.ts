import { withRoute } from "@/server/with-route";
import type { ConversationDto, MessageDto } from "@chanlytics/contracts";

/**
 * GET /api/v1/conversations — the session's threads with their transcripts,
 * RLS-scoped (session client; membership decides which tenants' rows exist).
 * Pilot scale: one list query + one IN query; pagination arrives with volume.
 */
export const GET = withRoute(async (_req, { supabase }) => {
  const { data: convs, error } = await supabase
    .from("conversations")
    .select("id, state, paused_until, snooze_until, assignee_user_id, last_wa_inbound_at, last_message_at, contacts (id, display_name, wa_profile_name, phone_e164)")
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
      .select("id, conversation_id, direction, sender, type, body, media, meta, created_at")
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
        created_at: m.created_at,
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
    last_wa_inbound_at: c.last_wa_inbound_at,
    last_message_at: c.last_message_at,
    contact: {
      id: c.contacts?.id ?? "",
      display_name: c.contacts?.display_name ?? null,
      wa_profile_name: c.contacts?.wa_profile_name ?? null,
      phone_e164: c.contacts?.phone_e164 ?? null,
    },
    messages: byConv.get(c.id) ?? [],
  }));
  return { conversations };
});
