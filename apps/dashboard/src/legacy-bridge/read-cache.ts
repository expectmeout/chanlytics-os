/**
 * The last answer to an ON-DEMAND read, for the life of the tab.
 *
 * `surface-cache.ts` does this for flipped surfaces, which publish window
 * globals and are restored before React renders. The reads that are NOT
 * surfaces -- the activity log, the back office -- were left cold: every visit
 * to the tab unmounted the pane, threw the rows away and painted nothing until
 * a fresh round trip landed. Measured on the salon's workspace: 763ms of empty
 * pane on the first visit and 433ms on the fifth, for a log that had not
 * changed. That is the whole of what "it loads slowly" meant.
 *
 * So: remember the last answer, let the page paint it at once, and read again
 * behind it. A page that seeds from here still says it is reading, because it
 * is -- what it does not do is show a reader nothing while it does.
 *
 * IN MEMORY ONLY, unlike surface-cache. Two reasons. The back office crosses
 * tenant lines, and another business's rows have no business in this tab's
 * sessionStorage under this workspace's key. And an ops page that survives a
 * reload would show a support engineer a workspace as it was before they
 * reloaded to check whether their own Retry had landed.
 *
 * Every key is scoped to the workspace it was read under, so switching
 * workspaces cannot paint the last one's rows: the prefix simply misses.
 */
import { getActiveWorkspace } from "./workspace";

/** Entries per cache. A log paged ten deep plus its filters, and no more. */
const MAX_ENTRIES = 24;

export interface ReadCache<T> {
  /** The last answer for this key, or null. Synchronous: this is what the first paint draws. */
  peek(key: string): T | null;
  /** Read, remember the answer, hand it back. A refusal is never remembered. */
  through(key: string, fresh: () => Promise<T>): Promise<T>;
  /** Start a read now, so a peek that follows hits. Never throws, never awaited. */
  warm(key: string, fresh: () => Promise<T>): void;
  /** Forget this cache's answers: something was written, so they describe the world as it was. */
  clear(): void;
}

const ALL: Array<{ clear: () => void }> = [];

export function readCache<T>(name: string, isWorthKeeping: (value: T) => boolean = () => true): ReadCache<T> {
  const store = new Map<string, T>();
  const scoped = (key: string) => `${getActiveWorkspace() || "-"}|${name}|${key}`;
  const cache: ReadCache<T> = {
    peek(key) {
      const hit = store.get(scoped(key));
      return hit === undefined ? null : hit;
    },
    async through(key, fresh) {
      const value = await fresh();
      if (isWorthKeeping(value)) {
        const at = scoped(key);
        // Oldest out first: Map keeps insertion order, and re-reading a key
        // moves it to the end so a log being paged does not evict its own head.
        store.delete(at);
        store.set(at, value);
        while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
      }
      return value;
    },
    warm(key, fresh) {
      if (store.has(scoped(key))) return;
      // The client already shares an identical read that is still in flight
      // (client/api.ts), so warming twice costs one request, not two.
      cache.through(key, fresh).catch(() => {});
    },
    clear() {
      store.clear();
    },
  };
  ALL.push(cache);
  return cache;
}

/** Every on-demand answer this tab is holding. Called when the workspace itself is dropped. */
export function clearReadCaches(): void {
  for (const c of ALL) c.clear();
}
