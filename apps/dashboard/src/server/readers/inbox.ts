import "server-only";
import { addressOf, heldThreadIds, type ConversationDto, type EscalationDto } from "@chanlytics/contracts";
import { load, stamp, type Reader, type ReaderContext, type RowRef } from "./index";
import { conversations, whoOf } from "./conversations";
import { escalations } from "./escalations";
import { log } from "@/server/log";

interface InboxRead {
  /** The escalated threads outside the newest hundred first, then the hundred: the Inbox's order. */
  conversations: ConversationDto[];
  /** The open escalations, newest first, as GET escalations answers them. */
  escalations: Array<EscalationDto & { conversation_id: string }>;
}

/**
 * The threads of open holds past the newest page, in one read by their ids (contracts heldThreadIds: the holds that
 * wait on a person first, a hundred at most): the Inbox's read and Today's, so a turn that asks both reads them once
 * (the reader cache shares the read by its ids) and the two judge every hold by its own thread. `threads` is null where
 * the read failed (each hold then counts as waiting: unknown is not handled); `missing` the ids it asked for.
 */
export async function heldThreadsBeyond(
  rc: ReaderContext,
  newest: readonly ConversationDto[],
  open: ReadonlyArray<EscalationDto & { conversation_id: string }>,
): Promise<{ threads: ConversationDto[] | null; missing: string[] }> {
  const missing = heldThreadIds(new Set(newest.map((c) => c.id)), open);
  if (!missing.length) return { threads: [], missing };
  const threads = await load(rc, conversations, { ids: missing }).then(
    (r) => r.data.conversations,
    () => null,
  );
  return { threads, missing };
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
    // One read for all of them, by id (heldThreadsBeyond, Today's read too).
    const held = await heldThreadsBeyond(rc, newest.data.conversations, open.data.escalations);
    const extra = held.threads ?? [];
    const unread = held.missing.length - extra.length;
    if (unread) log.error("inbox_escalated_fetch_failed", { unread });
    const all = [...extra, ...newest.data.conversations];
    return {
      data: { conversations: all, escalations: open.data.escalations },
      rows: all.map((c): RowRef => ({
        kind: "thread",
        id: c.id,
        route: addressOf({ kind: "conversation", id: c.id }),
        label: whoOf(c),
      })),
      stamp: stamp(),
    };
  },
};
