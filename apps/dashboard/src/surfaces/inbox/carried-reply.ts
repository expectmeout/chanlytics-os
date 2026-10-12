/**
 * A reply carried into a thread's box from another page: a press there (Text the booking link on People's row, the person's
 * page and the Calendar's panel; a send from the Pipeline's peek) opens the thread with its words ready, and nothing is sent by
 * carrying them. The words wait in this tab's session for the thread they name, and the composer takes them as that thread
 * opens: only into an empty box, and only once (thread/composer.tsx). Four pages wrote the hand-over each in their own words
 * and one read it; this is both halves, and it imports nothing, so a page that carries a reply does not load the Inbox for it.
 */

/** Where the words wait: this tab's session, which another tab never reads. */
const CARRIED = "chanlytics-compose";

/** The thread the words are for, as the Inbox names it (`th-<id>`): a route to it (`inbox/th-<id>`) is the same thread. */
const threadIdOf = (to: string): string => to.replace(/^inbox\//, "");

/** Carry `text` to the thread `to` names. A browser that keeps no session carries nothing, and the thread opens as it would. */
export function carryReply(to: string, text: string): void {
  try {
    sessionStorage.setItem(CARRIED, JSON.stringify({ threadId: threadIdOf(to), text }));
  } catch {
    /* nothing to carry */
  }
}

/** The words carried to the thread `threadId`, taken so they are never put in twice; null when none wait for it. */
export function takeCarriedReply(threadId: string): string | null {
  try {
    const raw = sessionStorage.getItem(CARRIED);
    if (!raw) return null;
    const carried: unknown = JSON.parse(raw);
    const field = (name: string): unknown =>
      carried && typeof carried === "object" ? Reflect.get(carried, name) : undefined;
    const text = field("text");
    const at = field("threadId");
    if (typeof text !== "string") return null;
    // Said bare or as the Inbox names it (`th-<id>`), by whichever page carried it.
    const mine = at === threadId || at === `th-${threadId}` || `th-${String(at)}` === threadId;
    if (!mine) return null;
    sessionStorage.removeItem(CARRIED);
    return text;
  } catch {
    return null;
  }
}
