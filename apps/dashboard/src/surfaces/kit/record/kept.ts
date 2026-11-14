/**
 * A fold's change not saved, kept in the tab (13 Nov 2026): the tab's memory (bridge/tab-memory.ts, through shell-verbs.ts
 * tabMemory) holds it as it holds a composer's words (work.tsx), one per fold id, for this workspace and this tab, a day at
 * most, and forgets it at sign-out.
 *
 * Every way off a page asks before a change is thrown away (held-move.ts), but the browser lets a page stop only some of
 * them: a second Back with nothing pressed between, and every Back where there is no Navigation API, go without a word.
 * Kept here, a change typed into a fold comes back with its page however the page was left (hooks.ts useRecordFold's
 * `keep`), and the question is a courtesy, never the only thing between a person and what they typed.
 *
 * What lets it go is the person's own answer, through the registry (registry.ts): the fold closed by its page (its save
 * taken, or Cancel) and a change discarded (another fold asked for, or "Yes, leave"). A storage that refuses (a private
 * window) costs the memory, never the page.
 */
import { tabMemory } from "./shell-verbs";

/** The tab memory's kind for a fold's change: one per fold, by its id. */
const KEPT_KIND = "fold";

/** What was typed into the fold `id` and kept, or null. */
export function keptChange<D>(id: string | number): D | null {
  try {
    return tabMemory()?.draft<D>(KEPT_KIND, String(id)) ?? null;
  } catch {
    return null;
  }
}

/** Keep what the fold `id` holds now, in place of what it held before. */
export function keepChange(id: string | number, value: unknown): void {
  try {
    tabMemory()?.keepDraft(KEPT_KIND, value, String(id));
  } catch {
    /* the memory is lost, never the page */
  }
}

/** The fold `id` holds nothing worth keeping: forget what it held. */
export function dropChange(id: string | number): void {
  try {
    tabMemory()?.dropDraft(KEPT_KIND, String(id));
  } catch {
    /* the memory is lost, never the page */
  }
}
