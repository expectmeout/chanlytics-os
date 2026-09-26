import type { InboxThreadVM } from "@chanlytics/contracts";

/**
 * A thread's state in Ask's words, from the Inbox row's own view model: who it waits on first, then whether it is
 * snoozed or the person opted out, else the receptionist is answering. One derivation for every place Ask says it
 * (list_threads, get_thread, the page context's Inbox rows).
 */
export function threadState(v: Pick<InboxThreadVM, "needsYou" | "takenOver" | "state" | "optedOut">): string {
  if (v.needsYou) return "needs you";
  if (v.takenOver) return "waiting on you";
  if (v.state === "snoozed") return "snoozed";
  if (v.optedOut) return "opted out";
  return "answering";
}
