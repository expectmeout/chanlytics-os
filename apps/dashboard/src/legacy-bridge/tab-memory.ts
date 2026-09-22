/**
 * What a tab keeps for its pages: where the member was in each view of a page, and work half-done.
 *
 * Leads kept both in two slots of its own, and every other page kept nothing: a refresh, or a trip to another page,
 * lost the Inbox's search, a list's scroll, a reply half-written. This is the one store for any page with a place or
 * a draft worth keeping (the loading standard's F and G), published as `window.__tabMemory` before the pages mount.
 *
 * - The TAB's storage (sessionStorage), never the device's: a front desk's computer is shared, and the next person
 *   on it must not inherit the last one's words. A refresh and a trip to another page keep it; closing the tab and
 *   signing out do not (clearTabMemory, from clearSurfaceCache).
 * - Per workspace, from the address (/w/<slug>): an account in two never sees one's words in the other.
 * - A place is whatever the page keeps for a view ({ q, cursor, top, ... }). One left the way its view opens is not
 *   remembered at all, and a page keeps its last twelve views.
 * - A draft is half-done work of a kind (a Find, a reply to one thread) under an optional key. A day old, it goes.
 * - A selection is never kept, by any page: one that came back unseen is what a bulk act should never find.
 * - A storage that refuses (a private window) costs the memory, never the page.
 */
import { pathWorkspace } from "./workspace";

const PLACE_SLOT = "chanlytics.place.v1";
const DRAFT_SLOT = "chanlytics.drafts.v1";
/** Every slot this store writes, and the two Leads kept before it: all of them go at sign-out. */
export const TAB_SLOTS: readonly string[] = [PLACE_SLOT, DRAFT_SLOT, "chanlytics.leads.place.v1", "chanlytics.leads.finder.v1"];
const PLACES_PER_PAGE = 12;
const DRAFTS_KEPT = 40;
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

type Place = Record<string, unknown>;
export interface TabMemory {
  /** Where the member was in this view of the page, or null. */
  place(page: string, view: string): Place | null;
  /** Keep it; a place with nothing in it forgets the view instead. */
  keepPlace(page: string, view: string, place: Place): void;
  /** Half-done work of a kind, under a key when there is one per thing (a reply per thread), or null. */
  draft<T = unknown>(kind: string, key?: string): T | null;
  keepDraft(kind: string, value: unknown, key?: string): void;
  dropDraft(kind: string, key?: string): void;
}

interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
type WindowLike = { location?: { pathname?: string }; sessionStorage?: StorageLike; __tabMemory?: TabMemory };

const readAll = <T>(s: StorageLike | undefined, slot: string): Record<string, T> => {
  try {
    const v = JSON.parse((s && s.getItem(slot)) || "{}");
    return v && typeof v === "object" ? (v as Record<string, T>) : {};
  } catch {
    return {};
  }
};
const writeAll = (s: StorageLike | undefined, slot: string, all: Record<string, unknown>): void => {
  try {
    if (s) s.setItem(slot, JSON.stringify(all));
  } catch {
    /* a private window: the memory lives for the page */
  }
};
const worthKeeping = (p: Place): boolean => Object.values(p).some((v) => !!v);

export function tabMemoryFor(win: WindowLike, opts: { now?: () => number } = {}): TabMemory {
  const now = opts.now ?? (() => Date.now());
  const store = () => win.sessionStorage;
  const ws = () => pathWorkspace((win.location && win.location.pathname) || "") ?? "-";
  const placeId = (page: string, view: string) => `${ws()}|${page}|${view}`;
  const draftId = (kind: string, key?: string) => `${ws()}|${kind}|${key ?? ""}`;
  return {
    place(page, view) {
      const hit = readAll<Place>(store(), PLACE_SLOT)[placeId(page, view)];
      return hit && typeof hit === "object" ? hit : null;
    },
    keepPlace(page, view, place) {
      const all = readAll<Place>(store(), PLACE_SLOT);
      const id = placeId(page, view);
      delete all[id];
      // The newest is last, so the oldest of this page's views is what goes.
      if (worthKeeping(place)) all[id] = place;
      const mine = Object.keys(all).filter((k) => k.startsWith(`${ws()}|${page}|`));
      for (const old of mine.slice(0, Math.max(0, mine.length - PLACES_PER_PAGE))) delete all[old];
      writeAll(store(), PLACE_SLOT, all);
    },
    draft<T>(kind: string, key?: string): T | null {
      const hit = readAll<{ at: number; value: T }>(store(), DRAFT_SLOT)[draftId(kind, key)];
      return hit && now() - hit.at < DRAFT_TTL_MS ? hit.value : null;
    },
    keepDraft(kind, value, key) {
      const all = readAll<{ at: number; value: unknown }>(store(), DRAFT_SLOT);
      const id = draftId(kind, key);
      delete all[id];
      all[id] = { at: now(), value };
      for (const [k, v] of Object.entries(all)) if (!(now() - v.at < DRAFT_TTL_MS)) delete all[k];
      const ids = Object.keys(all);
      for (const old of ids.slice(0, Math.max(0, ids.length - DRAFTS_KEPT))) delete all[old];
      writeAll(store(), DRAFT_SLOT, all);
    },
    dropDraft(kind, key) {
      const all = readAll(store(), DRAFT_SLOT);
      if (!(draftId(kind, key) in all)) return;
      delete all[draftId(kind, key)];
      writeAll(store(), DRAFT_SLOT, all);
    },
  };
}

/** The pages' one store, on the window they read it from. */
export function installTabMemory(win: WindowLike = window as unknown as WindowLike, opts: { now?: () => number } = {}): void {
  win.__tabMemory = tabMemoryFor(win, opts);
}

/** Everything the tab kept for its pages: at sign-out, with the surface cache (surface-cache.ts clearSurfaceCache). */
export function clearTabMemory(s: StorageLike | undefined = typeof sessionStorage === "undefined" ? undefined : sessionStorage): void {
  try {
    if (s) for (const slot of TAB_SLOTS) s.removeItem(slot);
  } catch {
    /* nothing to clear */
  }
}

declare global {
  interface Window {
    __tabMemory?: TabMemory;
  }
}
