/**
 * What the page says it drew, to Ask (OW6: Ask is told what is on screen one way). A page that holds the rows it draws in
 * state of its own (the Inbox's bucket, People's list and search, the Pipeline's box, the Calendar's span) says them as
 * it draws: their ids in its order, and the view they are under. Ask reads that when it opens, and
 * reads nothing else off the window: every other page's rows are the typed store's (`surfaceValue`, context.ts).
 *
 * This module holds the ledger and is its one writer and its one reader, so a page cannot say it a second
 * way, and a page that says it the wrong way (another key than its own, a value in no shape) is not believed: Ask is asked
 * about it with its route alone, and the reader says so by giving none rather than throwing. A surface imports the writer
 * through `frame-verbs` (`setAskOnScreen`, `askOnScreenKey`), as it imports every other door.
 */

/** The pages that say what they drew. */
export type OnScreenKey = "inbox" | "people" | "pipeline" | "calendar" | "ads" | "content";

/** What a page that holds its rows in state says it drew (D3): its key, the ids in its order, and its view. */
export interface OnScreen {
  key: OnScreenKey;
  ids: readonly string[];
  view?: string | null;
  /** The names the rows show, beside their ids, so the words can name one; kept in the tab. */
  labels?: readonly (string | undefined)[];
}

/** What a page last said is on screen, or null: the tab's one ledger. */
let onScreen: OnScreen | null = null;

/** Say what is on screen to Ask, or take it back with null: a page takes the ledger back only when it is its own. */
export function setAskOnScreen(on: OnScreen | null): void {
  onScreen = on;
}

/** What the ledger holds: the page Ask was last told is on screen, with its rows and view, or null. */
export function askOnScreen(): OnScreen | null {
  return onScreen;
}

/** The page Ask was last told is on screen, when one is. */
export function askOnScreenKey(): string | null {
  return onScreen?.key ?? null;
}
