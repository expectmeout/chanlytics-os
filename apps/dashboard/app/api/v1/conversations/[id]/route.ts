import { AppError } from "@chanlytics/contracts";
import type { ConversationDto, MessageDto } from "@chanlytics/contracts";
import { withRoute } from "@/server/with-route";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/v1/conversations/:id — one thread's transcript, paginated by ?before. */
export const GET = withRoute(async (req, { supabase, params, userId }) => {
  const id = String(params.id ?? "");
  if (!UUID.test(id)) throw new AppError("not_found", "Conversation not found.");
  const before = new URL(req.url).searchParams.get("before");

  const { data: conv, error } = await supabase
    .from("conversations")
    .select("id, state, paused_until, snooze_until, assignee_user_id, last_wa_inbound_at, last_message_at, contacts (id, display_name, wa_profile_name, phone_e164, consent, dnc)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conv) throw new AppError("not_found", "Conversation not found.");

  let q = supabase
    .from("messages")
    .select("id, direction, sender, type, body, media, meta, created_at, status, channel_ts")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (before) q = q.lt("created_at", before);
  const { data: msgs, error: merr } = await q;
  if (merr) throw new Error(merr.message);

  const conversation: Omit<ConversationDto, "messages"> = {
    id: conv.id,
    state: conv.state as ConversationDto["state"],
    paused_until: conv.paused_until,
    snooze_until: conv.snooze_until,
    assignee_user_id: conv.assignee_user_id,
    assignee_is_me: conv.assignee_user_id ? conv.assignee_user_id === userId : undefined,
    last_wa_inbound_at: conv.last_wa_inbound_at,
    last_message_at: conv.last_message_at,
    contact: {
      id: conv.contacts?.id ?? "",
      display_name: conv.contacts?.display_name ?? null,
      wa_profile_name: conv.contacts?.wa_profile_name ?? null,
      phone_e164: conv.contacts?.phone_e164 ?? null,
      consent: conv.contacts?.consent ?? null,
      dnc: conv.contacts?.dnc ?? false,
    },
  };
  const messages: MessageDto[] = (msgs ?? []).reverse().map((m) => ({
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
  }));
  return { conversation, messages };
});
