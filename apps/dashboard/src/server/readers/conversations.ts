import "server-only";
import {
  DAY_MS,
  LIST_MESSAGES_EACH,
  addressOf,
  contactName,
  theyWroteLast,
  type ConversationDto,
  type MessageDto,
} from "@chanlytics/contracts";
import { failedMessageErrors, lastClosedHolds, searchMessages } from "@chanlytics/db";
import { CONVERSATION_COLUMNS, groupMessages, messageRowsOf, toConversationDto } from "../dto";
import { seenOfPeople } from "../people/person-seen";
import { stamp, type Reader, type ReaderContext, type RowRef } from "./index";

/** The threads the Inbox's read holds: the newest hundred, or as many as one read by id names. */
const THREADS_MAX = 100;
/** The Inbox's messages across the threads it shows: every one's newest, so none is ever cut. */
const MESSAGES_MAX = LIST_MESSAGES_EACH * THREADS_MAX;
/** How far back the threads that say some words are looked for: search_messages' longest window (00219). */
const SAID_DAYS = 90;
/** The most messages that say them, whose threads are read: search_messages' own fifty. */
const SAID_HITS = 50;

/** Who a thread is with, as the Inbox row says it: toInboxThreadVM's own `who`. */
export const whoOf: (c: ConversationDto) => string = contactName;

/**
 * The threads whose messages say `words` in the last SAID_DAYS, newest first, through search_messages (00219), which
 * runs as the member: Conversations' search box, which matched words only in the messages the Inbox's read carried.
 */
async function threadsSaying(rc: ReaderContext, words: string): Promise<string[]> {
  const since = new Date(rc.now.getTime() - SAID_DAYS * DAY_MS);
  const hits = await searchMessages(rc.ctx.supabase, rc.tenantId, words, since, SAID_HITS);
  return [...new Set(hits.flatMap((h) => (h.kind === "message" && h.conversationId ? [h.conversationId] : [])))];
}

/**
 * GET conversations, as the route answers it: the hundred most recent
 * conversations of the workspace with their newest messages, as the Inbox
 * draws them, or the ones `ids` names (parsed, capped and checked by the
 * route), or the ones whose messages say `said`. A thread's messages are its
 * newest LIST_MESSAGES_EACH: a thread opened reads the rest (GET
 * conversations/:id). Each is a thread a citation may name, called what the
 * Inbox calls it.
 */
export const conversations: Reader<
  { ids: string[] | null; said?: string | null },
  { conversations: ConversationDto[] }
> = {
  name: "conversations",
  async read(rc, { ids: named, said }) {
    const { supabase } = rc.ctx;
    const { tenantId, userId } = rc;
    const asked = said ? await threadsSaying(rc, said) : named;
    if (asked && !asked.length) return { data: { conversations: [] }, rows: [], stamp: stamp() };
    const base = supabase.from("conversations").select(CONVERSATION_COLUMNS).eq("tenant_id", tenantId);
    const { data: convs, error } = await (asked
      ? base.in("id", asked)
      : base.order("last_message_at", { ascending: false, nullsFirst: false }).limit(THREADS_MAX));
    if (error) throw new Error(error.message);
    const ids = (convs ?? []).map((c) => c.id);
    const messagesOf = async (): Promise<Map<string, MessageDto[]>> => {
      if (!ids.length) return new Map();
      // One read, bounded by what it answers (00258): each thread's newest through the thread's own index, the id
      // breaking ties, as one list PostgREST's thousand rows do not cut. Paged by OFFSET, this read every message the
      // hundred threads ever had and sorted them for each page, up to four times on every refresh, and one thread with a
      // long history could fill every page and leave the others reading "No messages yet" (I5).
      const { data, error: merr } = await supabase.rpc("newest_messages", {
        p_tenant_id: tenantId,
        p_threads: ids,
        p_each: LIST_MESSAGES_EACH,
        p_most: MESSAGES_MAX,
      });
      if (merr) throw new Error(merr.message);
      const grouped = groupMessages(messageRowsOf(data));
      // newest_messages answers twelve columns and messages.error is not one of them: the few failed messages in the
      // answer are asked for theirs, so a failed bubble can say why (contracts sendFailureWords). None failed, no read.
      const failed = [...grouped.values()].flatMap((list) =>
        list.filter((m) => m.status === "failed").map((m) => m.id),
      );
      if (failed.length) {
        const why = new Map((await failedMessageErrors(supabase, tenantId, failed)).map((r) => [r.id, r.error]));
        for (const list of grouped.values()) for (const m of list) if (why.has(m.id)) m.error = why.get(m.id);
      }
      return grouped;
    };
    // The threads' messages beside the reader's own reading of each person here (00349, so a row can say it is new to
    // them): both follow from the threads and neither from the other. One after the other, the Inbox, Conversations and
    // Today each stood behind a round trip more than they asked for (9 Oct 2026).
    // And the newest hold that closed on each thread (contracts LastHoldDto), beside them rather than after, so the read
    // waits on no round trip more: one held and closed with nothing sent waits on a person for good (unansweredOf).
    const [byConv, seenOf, closedHolds] = await Promise.all([
      messagesOf(),
      seenOfPeople(
        rc.ctx,
        tenantId,
        (convs ?? []).flatMap((c) => (c.contacts?.id ? [c.contacts.id] : [])),
      ),
      ids.length ? lastClosedHolds(supabase, tenantId, ids) : Promise.resolve([]),
    ]);
    const holdOf = new Map(closedHolds.map((h) => [h.conversation_id, h]));
    const conversations: ConversationDto[] = (convs ?? []).map((c) => {
      const dto = toConversationDto(c, byConv.get(c.id) ?? [], userId, c.contacts?.id ? seenOf(c.contacts.id) : {});
      // Carried only where the customer wrote last: on any other thread a closed hold says nothing about who is waiting.
      const h = holdOf.get(c.id);
      return h && theyWroteLast(dto.messages)
        ? {
            ...dto,
            last_hold: { reason: h.reason, details: h.details, created_at: h.created_at, resolved_at: h.resolved_at },
          }
        : dto;
    });
    return {
      data: { conversations },
      rows: conversations.map((c): RowRef => ({
        kind: "thread",
        id: c.id,
        route: addressOf({ kind: "conversation", id: c.id }),
        label: whoOf(c),
      })),
      stamp: stamp(),
    };
  },
};
