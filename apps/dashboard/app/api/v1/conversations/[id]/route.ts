import { z } from "zod";
import { AppError } from "@chanlytics/contracts";
import type { ConversationDto, MessageDto } from "@chanlytics/contracts";
import { read } from "@/server/route";
import { conversationScope } from "@/server/verbs";
import { mediaPublic } from "@/server/dto";

const Query = z.object({
  /** Page back: messages created before this instant. */
  before: z.string().optional(),
});

/**
 * GET /api/v1/conversations/:id?before= — one thread and its most recent
 * hundred messages (older ones by paging back). The conversation is the row
 * (conversationScope): read under RLS, so one the caller cannot see is a
 * 404, and any member of the workspace it lives in may read it.
 */
export const GET = read({
  scope: conversationScope,
  query: Query,
  handle: async ({ ctx, row, input }) => {
    const { supabase, userId } = ctx;
    const id = row.id;
    const before = input.before ?? null;
    const { data: conv, error } = await supabase
      .from("conversations")
      .select("id, state, paused_until, snooze_until, assignee_user_id, last_wa_inbound_at, last_message_at, contacts (id, display_name, wa_profile_name, phone_e164, consent, dnc)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!conv) throw new AppError("not_found", "Conversation not found.");
    let q = supabase
      .from("messages")
      .select("id, direction, sender, type, body, media, meta, created_at, status, channel_ts, channel")
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
      media: mediaPublic(m.media),
      meta: m.meta as MessageDto["meta"],
      status: m.status,
      created_at: m.created_at,
      channel_ts: m.channel_ts,
      channel: m.channel,
    }));
    return { conversation, messages };
  },
});
