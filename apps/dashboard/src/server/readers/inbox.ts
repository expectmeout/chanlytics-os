import "server-only";
import type { ConversationDto, EscalationDto } from "@chanlytics/contracts";
import { load, stamp, type Reader, type RowRef } from "./index";
import { conversations, whoOf } from "./conversations";
import { escalations } from "./escalations";

interface InboxRead {
  /** The escalated threads outside the newest hundred first, then the hundred: the Inbox's order. */
  conversations: ConversationDto[];
  /** The open escalations, newest first, as GET escalations answers them. */
  escalations: Array<EscalationDto & { conversation_id: string }>;
}

/**
 * The Inbox, as the browser composes it (legacy-bridge/surface-data.ts,
 * inboxOverride): the newest hundred conversations and the open escalations
 * at once, then, in one read by id, every escalated thread that fell outside
 * the hundred, so a waiting customer is never invisible. One that read could
 * not bring is counted in the log, as the page counts it, and the list stands
 * without it. No route answers this; Ask is its only server-side reader.
 */
export const inbox: Reader<undefined, InboxRead> = {
  name: "inbox",
  async read(rc) {
    const [newest, open] = await Promise.all([
      load(rc, conversations, { ids: null }),
      load(rc, escalations, { state: "open" }),
    ]);
    const listed = new Set(newest.data.conversations.map((c) => c.id));
    const missing = [...new Set(open.data.escalations.map((e) => e.conversation_id))].filter((id) => !listed.has(id));
    // One read for all of them, by id: the escalations read holds a hundred at most.
    const extra = missing.length
      ? await load(rc, conversations, { ids: missing.slice(0, 100) }).then(
          (r) => r.data.conversations,
          () => [] as ConversationDto[],
        )
      : [];
    const unread = missing.length - extra.length;
    if (unread) console.error("inbox_escalated_fetch_failed", unread);
    const all = [...extra, ...newest.data.conversations];
    return {
      data: { conversations: all, escalations: open.data.escalations },
      rows: all.map((c): RowRef => ({ kind: "thread", id: c.id, route: `inbox/th-${c.id}`, label: whoOf(c) })),
      stamp: stamp(),
    };
  },
};
