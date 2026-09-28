/**
 * A reply to a reach-out on Today and in the bell (Reach out Part 5, PR 8): the queue's row for a thread whose reply was
 * read, in place of the handoff the intake raised for it, and the bell's action for its notice. Pure, over the readings
 * the Inbox's surface holds (`__REPLIES`); every word is here.
 */
import type { TodayQueueRowVM } from "../today/today-vm";
import { REPLY_INTENT_WORDS } from "./reach-out-replies";
import type { ReachOutReplyDto } from "./reach-out-reply-words";

/** Whether a reading makes its thread's row a reply's: read, standing, from a person, and not a no (which asks nothing). */
function rowWorthy(r: ReachOutReplyDto): boolean {
  return !r.undone && r.claim !== "auto_reply" && r.intent !== "no";
}

/** Whether the receptionist's draft for a reading is written and waiting in the reply box. */
const drafted = (r: ReachOutReplyDto): boolean => r.draft_state === "written" && !!r.draft;

/**
 * A thread's handoff row as a reply's (Task 8.1): what the reply was read as, their gist, and the door to it -- "Read
 * the draft" when the receptionist wrote one, "Open and reply" otherwise. The row keeps its thread, its wait and its
 * Snooze.
 */
export function replyRowOf(row: TodayQueueRowVM, r: ReachOutReplyDto): TodayQueueRowVM {
  const read = !r.unread && r.intent !== "other";
  return {
    ...row,
    kind: "reply",
    channel: "Email",
    status: read ? ["Wrote back", REPLY_INTENT_WORDS[r.intent]] : ["Wrote back"],
    sentence: r.summary ?? row.sentence,
    quoted: false,
    cta: { label: drafted(r) ? "Read the draft" : "Open and reply", to: row.cta.to },
  };
}

/**
 * Today's queue with each handoff whose thread's newest reading is a reply worth a row swapped for that row, in the
 * same place: the queue's order is by wait, and a reading does not change how long they have waited. A reading with no
 * open handoff adds no row (the queue is what needs a person), and a no or an automatic reply leaves its row as it was.
 */
export function withReplies(rows: TodayQueueRowVM[], readings: ReachOutReplyDto[]): TodayQueueRowVM[] {
  const newest = new Map<string, ReachOutReplyDto>();
  for (const r of readings) if (!newest.has(r.conversation_id)) newest.set(r.conversation_id, r);
  return rows.map((row) => {
    const r = row.kind === "handoff" && row.conversationId ? newest.get(row.conversationId) : undefined;
    return r && rowWorthy(r) ? replyRowOf(row, r) : row;
  });
}

/**
 * The bell's action for a notice (Task 8.3): "Read the draft" for a reply whose thread's newest reading has a draft
 * waiting, else the row's own. The look stays static (notifications.ts SERVER_LOOK); only this word reads the readings.
 */
export function bellActionOf(
  row: { kind: string; action: string; about?: { type: string; id: string } | null },
  readings: ReachOutReplyDto[],
): string {
  if (row.kind !== "reach_out_replied" || !row.about || row.about.type !== "conversation") return row.action;
  const r = readings.find((x) => x.conversation_id === row.about?.id);
  return r && !r.undone && drafted(r) ? "Read the draft" : row.action;
}
