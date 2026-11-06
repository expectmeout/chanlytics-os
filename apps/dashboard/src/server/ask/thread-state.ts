import type { InboxThreadVM } from "@chanlytics/contracts";

/**
 * A thread's state in Ask's words, from the Inbox row's own view model (contracts thread-move.ts, the rule the tabs read): who
 * it waits on first, then whether someone holds it, then whether it is snoozed or the person opted out, whether the next
 * move is theirs, else the receptionist is answering. One derivation for every place Ask says it (inbox.list, inbox.thread,
 * the page context's Inbox rows). A thread a teammate holds said "answering", which Ask's glossary defines as the
 * receptionist replying on its own (defect 16).
 */
export function threadState(
  v: Pick<InboxThreadVM, "move" | "takenOver" | "claimedByOther" | "state" | "optedOut">,
): string {
  const { move, list } = v.move;
  if (list === "escalated" && move !== "sending") return "needs you";
  if (v.takenOver) return "you have it";
  if (v.claimedByOther) return "a teammate is answering";
  if (v.state === "snoozed") return "snoozed";
  if (v.optedOut) return "opted out";
  if (list === "waiting" && move !== "replying") return "waiting on them";
  return "answering";
}
