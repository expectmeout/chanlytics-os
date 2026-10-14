/**
 * An open person's page hears that person write (the wiring plan's task 1.2, N1), and their thread change hands (the wiring's
 * second audit, W-thread-wait-step-1).
 *
 * People re-reads a message only while its own list is on screen (surface-registry.ts onlyOnItsPage, #1347: every page of contacts was
 * read for each message, wherever the owner was), and a person's page is another route, so a customer who answered while their page
 * was open changed nothing on it: its History and Coming up stood as they were until the owner went back, left the tab or changed
 * something. The Inbox and Conversations are read for every message, so the page hears them, and reads its one person again when
 * either holds something of theirs newer than the page does: a message or a call, never someone else's.
 *
 * A take-over, a hand-back, a snooze and its wake move no message clock: they write the thread alone, which the feed tells on every
 * message, so no surface of the page hears it by its table. The Inbox does, and its row of this person says the thread's standing
 * as the one rule derives it (contracts standing.ts, through inbox-thread.ts): the page reads its person again when that changes.
 */
import type { Thread } from "../../inbox/types";
import { surfaceValue } from "../../surface-values";
import { hear } from "../person-verbs";

/** The newest message or call of this person's that the Inbox or Conversations hold, as epoch milliseconds; 0 when they hold none. */
function newestOfTheirs(personId: string): number {
  let newest = 0;
  for (const thread of surfaceValue("inbox")?.THREADS ?? [])
    if (thread.clientId === personId) newest = Math.max(newest, thread.lastAtMs ?? 0);
  for (const row of surfaceValue("conversations")?.CONVERSATIONS ?? [])
    if (row.clientId === personId) newest = Math.max(newest, row.ts ?? 0);
  return newest;
}

/** What one Inbox row says of its thread's standing: whether it waits on someone, who has it, the act a hold asks, a reply counting down, a snooze's wake. */
const standingOfRow = (t: Thread): string =>
  [
    t.state,
    t.needsYou,
    t.takenOver,
    t.claimedByOther,
    t.assigneeUserId ?? "",
    t.holdAct ?? "",
    t.heldDraft?.messageId ?? "",
    t.wake ?? "",
  ].join("|");

/** This person's threads as the Inbox holds them, each by its id with its standing. */
export function standingsOfTheirs(personId: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const thread of surfaceValue("inbox")?.THREADS ?? [])
    if (thread.clientId === personId) out.set(String(thread.id), standingOfRow(thread));
  return out;
}

/**
 * Whether a thread the Inbox held of theirs stands otherwise now, or is gone (archived, combined away). A thread it holds for the
 * first time is not a move: a new thread comes with a message, which the clock above hears, and the Inbox's first read after the
 * page opened is no news to a page that read them itself.
 */
const movedSince = (before: Map<string, string>, now: Map<string, string>): boolean =>
  [...before].some(([id, standing]) => now.get(id) !== standing);

/**
 * Hear the Inbox and Conversations for one person: `again` is told the newest moment of theirs when it is later than `known()`, the
 * latest the page has read or been told of, or when a thread of theirs the Inbox held stands otherwise. Answers the stop.
 */
export function hearTheirThread(personId: string, known: () => number, again: (newest: number) => void): () => void {
  let standings = standingsOfTheirs(personId);
  const check = () => {
    const newest = newestOfTheirs(personId);
    const now = standingsOfTheirs(personId);
    const moved = movedSince(standings, now);
    standings = now;
    if (newest > known() || moved) again(newest);
  };
  const stops = ["surface:inbox", "surface:conversations"].map((event) => hear(event, check));
  return () => stops.forEach((stop) => stop());
}
