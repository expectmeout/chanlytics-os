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
 * IN MEMORY by default, unlike surface-cache. Two reasons. The back office
 * crosses tenant lines, and another business's rows have no business in this
 * tab's sessionStorage under this workspace's key. And an ops page that
 * survives a reload would show a support engineer a workspace as it was
 * before they reloaded to check whether their own Retry had landed.
 *
 * A cache of this workspace's own rows may be KEPT IN THE TAB instead (`tab`),
 * the way the surfaces are: a person's page. Measured on production (23 Sep
 * 2026): Today and Leads paint whole from the tab on a reload, and a person's
 * page painted their name and then waited 1.4 s for the rest, because the
 * answer it had read a moment before went with the reload.
 *
 * Every key is scoped to the workspace it was read under, so switching
 * workspaces cannot paint the last one's rows: the prefix simply misses.
 */
import { getActiveWorkspace } from "./workspace";

/** Entries per cache. A log paged ten deep plus its filters, and no more. */
const MAX_ENTRIES = 24;
/** A tab-kept cache's slot in sessionStorage (a slot name, not a credential). */
const TAB_SLOT = "chanlytics.reads.v1.";
/** What a tab-kept cache may hold in the tab: an answer larger than this is kept in memory only, and the whole shed oldest first. */
const TAB_ENTRY_CHARS = 250_000;
const TAB_TOTAL_CHARS = 1_000_000;
/** A deploy can change a view model's shape, so the tab's copy is the build's own, as surface-cache's is. */
const BUILD = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";

export interface ReadCache<T> {
  /** The last answer for this key, or null. Synchronous: this is what the first paint draws. */
  peek(key: string): T | null;
  /** Read, remember the answer, hand it back. A refusal is never remembered. */
  through(key: string, fresh: () => Promise<T>): Promise<T>;
  /** Start a read now, so a peek that follows hits. Never throws, never awaited. Held and current: nothing to read. */
  warm(key: string, fresh: () => Promise<T>): void;
  /** Let go of one answer: what it described is gone (a person deleted, a person the server no longer has). */
  forget(key: string): void;
  /** A write landed. A memory cache lets go of everything; a tab-kept one keeps its answers to paint and reads each again before it warms it. */
  stale(): void;
  /** Forget this cache's answers, in memory and in the tab: the workspace itself was dropped. */
  clear(): void;
}

export interface ReadCacheOptions {
  /**
   * Kept like a surface: in the tab's storage, so a reload paints it; through a write, painted and read again behind
   * (every page that peeks reads again as it opens); gone at sign-out and when the workspace is dropped
   * (clearReadCaches). Only for this workspace's own rows.
   */
  tab?: boolean;
}

const ALL: Array<{ clear: () => void; stale: () => void }> = [];

interface TabBlob {
  build: string;
  entries: Array<[string, unknown]>;
}

function tabStorage(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null; // storage blocked: a tab-kept cache is a memory cache then
  }
}

function readTab(name: string): Array<[string, unknown]> {
  const s = tabStorage();
  if (!s) return [];
  try {
    const raw = s.getItem(TAB_SLOT + name);
    if (!raw) return [];
    const blob = JSON.parse(raw) as TabBlob;
    if (!blob || blob.build !== BUILD || !Array.isArray(blob.entries)) {
      s.removeItem(TAB_SLOT + name);
      return [];
    }
    return blob.entries;
  } catch {
    return []; // corrupt, or unreadable: a cold tab
  }
}

function writeTab(name: string, store: Map<string, unknown>): void {
  const s = tabStorage();
  if (!s) return;
  // Newest last, as the Map keeps them; an answer too large to be worth parsing on the next boot stays in memory only.
  const entries: Array<[string, unknown, number]> = [];
  for (const [k, v] of store) {
    const size = JSON.stringify(v)?.length ?? 0;
    if (size <= TAB_ENTRY_CHARS) entries.push([k, v, size]);
  }
  let total = entries.reduce((n, e) => n + e[2], 0);
  while (entries.length && total > TAB_TOTAL_CHARS) total -= entries.shift()![2];
  const blob: TabBlob = { build: BUILD, entries: entries.map(([k, v]) => [k, v]) };
  try {
    s.setItem(TAB_SLOT + name, JSON.stringify(blob));
  } catch {
    // Quota: the tab's copy is an optimisation, never a requirement. An older copy left behind would be painted as
    // current on the next reload, so none is better than that.
    try {
      s.removeItem(TAB_SLOT + name);
    } catch {
      /* nothing to remove */
    }
  }
}

export function readCache<T>(
  name: string,
  isWorthKeeping: (value: T) => boolean = () => true,
  opts: ReadCacheOptions = {},
): ReadCache<T> {
  const store = new Map<string, T>();
  // Held, but read before the latest write (or before this page's last reload): painted, and read again before a warm-up
  // counts it as held.
  const old = new Set<string>();
  // The tab's copy is read once, on first use rather than at import: importing this file never touches storage.
  let loaded = !opts.tab;
  const load = () => {
    if (loaded) return;
    loaded = true;
    for (const [k, v] of readTab(name)) {
      store.set(k, v as T);
      old.add(k);
    }
  };
  const save = () => {
    if (opts.tab) writeTab(name, store as Map<string, unknown>);
  };
  const scoped = (key: string) => `${getActiveWorkspace() || "-"}|${name}|${key}`;
  const cache: ReadCache<T> = {
    peek(key) {
      load();
      const hit = store.get(scoped(key));
      return hit === undefined ? null : hit;
    },
    async through(key, fresh) {
      const value = await fresh();
      load();
      if (isWorthKeeping(value)) {
        const at = scoped(key);
        // Oldest out first: Map keeps insertion order, and re-reading a key
        // moves it to the end so a log being paged does not evict its own head.
        store.delete(at);
        store.set(at, value);
        old.delete(at);
        while (store.size > MAX_ENTRIES) {
          const first = store.keys().next().value as string;
          store.delete(first);
          old.delete(first);
        }
        save();
      }
      return value;
    },
    warm(key, fresh) {
      load();
      const at = scoped(key);
      if (store.has(at) && !old.has(at)) return;
      // The client already shares an identical read that is still in flight
      // (client/api.ts), so warming twice costs one request, not two.
      cache.through(key, fresh).catch(() => {});
    },
    forget(key) {
      load();
      const at = scoped(key);
      if (!store.delete(at)) return;
      old.delete(at);
      save();
    },
    stale() {
      if (!opts.tab) {
        cache.clear();
        return;
      }
      load();
      for (const k of store.keys()) old.add(k);
    },
    clear() {
      store.clear();
      old.clear();
      loaded = true;
      if (opts.tab) {
        try {
          tabStorage()?.removeItem(TAB_SLOT + name);
        } catch {
          /* nothing to clear */
        }
      }
    },
  };
  ALL.push(cache);
  return cache;
}

/** Every on-demand answer this tab is holding, in memory and in the tab. Called at sign-out and when the workspace itself is dropped. */
export function clearReadCaches(): void {
  for (const c of ALL) c.clear();
}

/**
 * A write landed, so every answer held describes the world as it was. A memory cache lets go of them all; a tab-kept
 * one keeps them to paint the next page it opens, which reads them again behind as it always does, and reads each
 * again before warming it.
 */
export function staleReadCaches(): void {
  for (const c of ALL) c.stale();
}
