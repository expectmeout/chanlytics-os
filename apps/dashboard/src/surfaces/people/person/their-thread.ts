/**
 * An open person's page hears that person write (the wiring plan's task 1.2, N1).
 *
 * People re-reads a message only while its own list is on screen (surface-registry.ts onlyOnItsPage, #1347: every page of contacts was
 * read for each message, wherever the owner was), and a person's page is another route, so a customer who answered while their page
 * was open changed nothing on it: its History and Coming up stood as they were until the owner went back, left the tab or changed
 * something. The Inbox and Conversations are read for every message, so the page hears them, and reads its one person again when
 * either holds something of theirs newer than the page does: a message or a call, never someone else's.
 */
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

/**
 * Hear the Inbox and Conversations for one person: `again` is told the newest moment of theirs when it is later than `known()`, the
 * latest the page has read or been told of. Answers the stop.
 */
export function hearTheirThread(personId: string, known: () => number, again: (newest: number) => void): () => void {
  const check = () => {
    const newest = newestOfTheirs(personId);
    if (newest > known()) again(newest);
  };
  const stops = ["surface:inbox", "surface:conversations"].map((event) => hear(event, check));
  return () => stops.forEach((stop) => stop());
}
