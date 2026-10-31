/**
 * A reply carried into a thread's box from another page: a press there (Text the booking link on People's row, the person's
 * page and the Calendar's panel; a send from the Pipeline's peek) opens the thread with its words ready, and nothing is sent by
 * carrying them. The words wait in this tab's session for the thread they name, and the composer takes them as that thread
 * opens: only into an empty box, and only once (thread/composer.tsx). Four pages wrote the hand-over each in their own words
 * and one read it; this is both halves, and it imports nothing, so a page that carries a reply does not load the Inbox for it.
 *
 * And the other way: a question carried from a thread to its person's page (decision 0080). Not a person deletes, so it
 * is asked where Delete person is, with its typed name, and the thread's Actions open that page with it asked.
 */

/** Where the words wait: this tab's session, which another tab never reads. */
const CARRIED = "chanlytics-compose";
/** Where a person's page finds Not a person asked for them, in this tab's session. */
const NOT_A_PERSON = "chanlytics-not-a-person";

/** Ask Not a person of someone as their page opens. A browser that keeps no session opens the page alone. */
export function carryNotAPerson(personId: string): void {
  try {
    sessionStorage.setItem(NOT_A_PERSON, personId);
  } catch {
    /* nothing to carry */
  }
}

/** Whether Not a person was asked of `personId` from a thread, taken so it is asked once. */
export function takeCarriedNotAPerson(personId: string): boolean {
  try {
    if (sessionStorage.getItem(NOT_A_PERSON) !== personId) return false;
    sessionStorage.removeItem(NOT_A_PERSON);
    return true;
  } catch {
    return false;
  }
}

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
