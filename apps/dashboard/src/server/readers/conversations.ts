import "server-only";
import { contactName, type ConversationDto, type MessageDto } from "@chanlytics/contracts";
import { CONVERSATION_COLUMNS, groupMessages, messageRowsOf, toConversationDto } from "../dto";
import { stamp, type Reader, type RowRef } from "./index";

/** Each thread's newest messages the Inbox holds: a hundred, the page GET conversations/:id reads a thread by. */
const EACH = 100;
/** The Inbox's messages across the threads it shows, newest first. */
const MESSAGES_MAX = 4000;

/** Who a thread is with, as the Inbox row says it: toInboxThreadVM's own `who`. */
export const whoOf: (c: ConversationDto) => string = contactName;

/**
 * GET conversations, as the route answers it: the hundred most recent
 * conversations of the workspace with their recent messages, as the Inbox
 * draws them, or the ones `ids` names (parsed, capped and checked by the
 * route). A thread's recent messages are its newest hundred, and the read holds
 * four thousand in all. Each is a thread a citation may name, called what the
 * Inbox calls it.
 */
export const conversations: Reader<{ ids: string[] | null }, { conversations: ConversationDto[] }> = {
  name: "conversations",
  async read(rc, { ids: asked }) {
    const { supabase } = rc.ctx;
    const { tenantId, userId } = rc;
    const base = supabase.from("conversations").select(CONVERSATION_COLUMNS).eq("tenant_id", tenantId);
    const { data: convs, error } = await (asked
      ? base.in("id", asked)
      : base.order("last_message_at", { ascending: false, nullsFirst: false }).limit(100));
    if (error) throw new Error(error.message);
    const ids = (convs ?? []).map((c) => c.id);
    let byConv = new Map<string, MessageDto[]>();
    if (ids.length) {
      // One read, bounded by what it answers (00258): each thread's newest hundred through the thread's own index,
      // then the newest four thousand of those, the id breaking ties, as one list PostgREST's thousand rows do not
      // cut. Paged by OFFSET, this read every message the hundred threads ever had and sorted them for each page, up
      // to four times on every refresh, and one thread with a long history could fill every page and leave the others
      // reading "No messages yet" (I5).
      const { data, error: merr } = await supabase.rpc("newest_messages", {
        p_tenant_id: tenantId,
        p_threads: ids,
        p_each: EACH,
        p_most: MESSAGES_MAX,
      });
      if (merr) throw new Error(merr.message);
      byConv = groupMessages(messageRowsOf(data));
    }
    const conversations: ConversationDto[] = (convs ?? []).map((c) =>
      toConversationDto(c, byConv.get(c.id) ?? [], userId),
    );
    return {
      data: { conversations },
      rows: conversations.map((c): RowRef => ({
        kind: "thread",
        id: c.id,
        route: `inbox/th-${c.id}`,
        label: whoOf(c),
      })),
      stamp: stamp(),
    };
  },
};
