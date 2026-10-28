/**
 * Need you's drafted reply in the thread's own box (the live walk's INBOX-2, 27 Oct 2026). The strip over an emailed
 * thread's composer says a reply is drafted "to change or send from here", and the box was empty: the draft lived on
 * Today alone. Ask's draft for the thread (decision 0071, 00475), kept as Need you drew its row, is read as Today reads
 * it (GET conversations/drafts) and put in an empty box once, where it answers their newest message. Nothing is drafted
 * here and nothing is sent by it: the box's own Send sends what the box holds, every word open to change first.
 */
import { draftHasWords, draftIsCurrent } from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import type { Thread } from "../types";

/**
 * Their newest message, which a kept draft must answer (contracts today-queue writesOf), while it is the thread's newest
 * word: null where they wrote none, or where someone answered since. A draft is kept until they write again, so a reply
 * sent from Gmail or by a teammate left it standing, and the box offered the same answer to send a second time.
 */
function newestTheirs(thread: Pick<Thread, "timeline">): string | null {
  const last = [...(thread.timeline ?? [])].reverse().find((e) => e.type === "msg");
  return last && last.type === "msg" && last.from === "client" ? (last.messageId ?? null) : null;
}

/**
 * The words of the reply Ask kept for a real thread's newest message from them. Null where there is none to put in the
 * box: a thread of the mockup's, no message of theirs, no draft kept for it, a read refused.
 */
export async function keptReplyOf(thread: Thread): Promise<string | null> {
  if (!thread.real) return null;
  const forId = newestTheirs(thread);
  if (!forId) return null;
  const read = await api()("GET conversations/drafts", { query: { ids: thread.conversationId } }).catch(() => null);
  const kept = read && read.ok ? read.data.drafts.find((d) => d.kind === "reply") : undefined;
  return kept && draftIsCurrent(kept, forId) && draftHasWords(kept) ? kept.words.text : null;
}
