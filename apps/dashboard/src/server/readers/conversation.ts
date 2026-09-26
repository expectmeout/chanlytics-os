import "server-only";
import { AppError, personName, type ConversationDto, type MessageDto } from "@chanlytics/contracts";
import { mediaPublic } from "../dto";
import { loadConversation, type VerbConversation } from "../verbs";
import { load, stamp, type Reader, type RowRef } from "./index";

/**
 * One thread's messages, as GET conversations/:id answers them: the hundred
 * most recent, or the hundred before `before` when the thread pages back,
 * oldest first. The thread itself is not read here: the route's scope loaded
 * it, and Ask's `conversation` below loads it the same way, so neither reads
 * the row twice. An attachment is its public facts (mediaPublic): the storage
 * path never leaves the server. A message is cited by its thread.
 */
export const messagesOf: Reader<{ id: string; before: string | null }, MessageDto[]> = {
  name: "messagesOf",
  async read(rc, { id, before }) {
    const { supabase } = rc.ctx;
    let q = supabase
      .from("messages")
      .select("id, direction, sender, type, body, media, meta, created_at, status, channel_ts, channel")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (before) q = q.lt("created_at", before);
    const { data: msgs, error: merr } = await q;
    if (merr) throw new Error(merr.message);
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
    return { data: messages, rows: [], stamp: stamp() };
  },
};

/**
 * The thread as GET conversations/:id answers it, from the row its scope
 * loaded (loadConversation carries every column the page needs): a pure
 * assembly, no read.
 */
export function conversationDtoOf(row: VerbConversation, userId: string): Omit<ConversationDto, "messages"> {
  return {
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
}

/**
 * One thread with its messages, for Ask, as the page reads it: the row through
 * the loader GET conversations/:id's scope uses (under RLS, so a thread the
 * caller cannot see is that route's 404, in its words), then the route's own
 * messages and assembly. RLS lets a member of two workspaces see both; a turn
 * reads its own workspace, so a thread of the other is not here either, and
 * says so the same way before any message of it is read. The thread and its
 * person are named as the Inbox row names them: the loader carries the
 * person's email, which the route's payload does not, so a person reached only
 * by email is their address here as on the Inbox, never "Unknown".
 */
export const conversation: Reader<
  { id: string; before: string | null },
  { conversation: Omit<ConversationDto, "messages">; messages: MessageDto[] }
> = {
  name: "conversation",
  async read(rc, { id, before }) {
    const row = await loadConversation(rc.ctx, id);
    if (row.tenant_id !== rc.tenantId) throw new AppError("not_found", "Conversation not found.", 404);
    const messages = (await load(rc, messagesOf, { id: row.id, before })).data;
    const label = personName(row);
    const rows: RowRef[] = [{ kind: "thread", id: row.id, route: `inbox/th-${row.id}`, label }];
    if (row.contact_id) rows.push({ kind: "person", id: row.contact_id, route: `clients/${row.contact_id}`, label });
    return { data: { conversation: conversationDtoOf(row, rc.userId), messages }, rows, stamp: stamp() };
  },
};
