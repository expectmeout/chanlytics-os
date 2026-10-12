/**
 * What the page says it drew, to Ask (OW6: Ask is told what is on screen one way). A page that holds the rows it draws in
 * state of its own (the Inbox's bucket, People's list and search, the Pipeline's box, the Calendar's span, Campaigns'
 * ledger) says them as it draws: their ids in its order, and the view they are under. Ask reads that when it opens, and
 * reads nothing else off the window: every other page's rows are the typed store's (`surfaceValue`, context.ts).
 *
 * This module is the one writer of the window's `__askOnScreen` and the one reader of it, so a page cannot say it a second
 * way, and a page that says it the wrong way (another key than its own, a value in no shape) is not believed: Ask is asked
 * about it with its route alone, and the reader says so by giving none rather than throwing. A surface imports the writer
 * through `legacy-verbs` (`setAskOnScreen`, `askOnScreenKey`), as it imports every other door.
 */

/** The pages that say what they drew. */
export type OnScreenKey = "inbox" | "people" | "pipeline" | "calendar" | "campaigns";

/** What a page that holds its rows in state says it drew (D3): its key, the ids in its order, and its view. */
export interface OnScreen {
  key: OnScreenKey;
  ids: readonly string[];
  view?: string | null;
  /** The names the rows show, beside their ids, so the words can name one; kept in the tab. */
  labels?: readonly (string | undefined)[];
}

/** The window name the ledger is kept under. Nothing else names it. */
const LEDGER = "__askOnScreen";

/** Say what is on screen to Ask, or take it back with null: a page takes the ledger back only when it is its own. */
export function setAskOnScreen(on: OnScreen | null): void {
  Reflect.set(window, LEDGER, on);
}

/** What a window holds of the ledger: a record with a key, or nothing. */
export function askOnScreenOf(win: object): { key: string; ids: unknown; view: unknown; labels: unknown } | null {
  const v: unknown = Reflect.get(win, LEDGER);
  if (typeof v !== "object" || v === null || !("key" in v) || typeof v.key !== "string") return null;
  const s = v as Record<string, unknown>;
  return { key: v.key, ids: s.ids, view: s.view, labels: s.labels };
}

/** The page Ask was last told is on screen, when one is. */
export function askOnScreenKey(): string | null {
  return askOnScreenOf(window)?.key ?? null;
}
