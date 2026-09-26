import "server-only";
import { contactName, type ConversationDto, type MessageDto } from "@chanlytics/contracts";
import { CONVERSATION_COLUMNS, MESSAGE_COLUMNS, groupMessages, toConversationDto, type MessageRow } from "../dto";
import { stamp, type Reader, type RowRef } from "./index";

/** The most rows PostgREST answers for one select (supabase config max_rows): a longer read pages. */
const PAGE = 1000;
/** The Inbox's messages across the threads it shows, newest first. */
const MESSAGES_MAX = 4000;

/** Who a thread is with, as the Inbox row says it: toInboxThreadVM's own `who`. */
export const whoOf: (c: ConversationDto) => string = contactName;

/**
 * GET conversations, as the route answers it: the hundred most recent
 * conversations of the workspace with their recent messages, as the Inbox
 * draws them, or the ones `ids` names (parsed, capped and checked by the
 * route). Each is a thread a citation may name, called what the Inbox calls it.
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
