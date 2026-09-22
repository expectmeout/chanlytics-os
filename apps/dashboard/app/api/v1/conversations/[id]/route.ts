import { z } from "zod";
import type { ConversationDto, MessageDto } from "@chanlytics/contracts";
import { read } from "@/server/route";
import { conversationScope } from "@/server/verbs";
import { mediaPublic } from "@/server/dto";

const Query = z.object({
  /** Page back: messages created before this instant. */
  // Refused here rather than handed to PostgREST as a timestamp: an unparseable
  // value comes back as 22P02, which is not an AppError, so withRoute renders a
  // client's typo as a 500 "Something went wrong" -- the exact failure
  // requireUuid exists to prevent for ids.
  before: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "before must be a timestamp.")
    .optional(),
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
    // `row` IS the conversation: conversationScope loaded it under RLS a moment
    // ago and 404s when it is not there. This re-read the same row through the
    // same join for five more columns, doubling the round trips on the Inbox's
    // hottest read -- and its own `if (!conv) 404` could never fire. The five
    // columns ride on loadConversation now.
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
      id: row.id,
      state: row.state as ConversationDto["state"],
      paused_until: row.paused_until,
      snooze_until: row.snooze_until,
      assignee_user_id: row.assignee_user_id,
      assignee_is_me: row.assignee_user_id ? row.assignee_user_id === userId : undefined,
      last_wa_inbound_at: row.last_wa_inbound_at,
      last_message_at: row.last_message_at,
      contact: {
        id: row.contact_id,
        display_name: row.display_name,
        wa_profile_name: row.wa_profile_name,
        phone_e164: row.phone_e164,
        consent: row.consent,
        dnc: row.dnc,
        marketing_consent: row.marketing_consent,
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
