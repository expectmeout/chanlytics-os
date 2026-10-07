import type { InboxThreadVM } from "@chanlytics/contracts";

/**
 * A thread's state in Ask's words, from the Inbox row's own view model (standingOf, through threadStanding): who it
 * waits on first, then whether a teammate holds it, then whether it is snoozed or the person opted out, else the
 * receptionist is answering. One derivation for every place Ask says it (inbox.list, inbox.thread, the page context's
 * Inbox rows). A thread a teammate holds said "answering", which Ask's glossary defines as the receptionist replying on
 * its own (defect 16).
 */
export function threadState(
  v: Pick<InboxThreadVM, "needsYou" | "takenOver" | "claimedByOther" | "state" | "optedOut">,
): string {
  if (v.needsYou) return "needs you";
  if (v.takenOver) return "waiting on you";
  if (v.claimedByOther) return "a teammate is answering";
  if (v.state === "snoozed") return "snoozed";
  if (v.optedOut) return "opted out";
  return "answering";
}
