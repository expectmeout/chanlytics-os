/**
 * A thing open over the page by a query word of its own on the page's address: the lead sheet's `?lead=<id>`
 * (leads/sheet/lead-over.ts, the canvas's W8, 18 Oct 2026) and a run's or a message's `?see=<kind>:<id>` (see-over.ts, the
 * Campaigns wiring review's rule C). Read in the browser only (the frame is one prerender for every address); opened as one
 * entry in the history, so Back closes it and the page under it is as it was left; closed with the page, whose move leaves
 * the query behind. The one home of what the two do alike: each names its word and what its value holds.
 */
import { hearPageMoves } from "../legacy-verbs";

interface OverQuery {
  /** The word's value on the address, or null: none there, or no window (a prerender). */
  now(): string | null;
  /** The page's own address with this value over it, or with none. */
  addressWith(value: string | null): string;
  /** Open a value over the page: one entry, so Back closes it; with `move`, one already open is moved to it in place. */
  open(value: string, move?: boolean): void;
  /** Close it: Back where opening it made the entry, else the address without it. */
  close(): void;
  /** Hear it open, move or close: its own verbs, a Back (the window's popstate), and a page's own move (the frame's). */
  hear(fn: () => void): () => void;
}

/** The entry an opening stands: the word it was opened by, so a close knows the entry Back would take is its own. */
interface OverEntry {
  over: string;
  value: string;
}

export function overQuery(word: string): OverQuery {
  const heard = new Set<() => void>();
  const say = () => {
    for (const fn of heard) fn();
  };
  const now = (): string | null =>
    typeof window === "undefined" || !window.location
      ? null
      : new URLSearchParams(window.location.search).get(word) || null;
  const addressWith = (value: string | null): string => {
    const l = window.location;
    const url = l.href
      ? new URL(l.href)
      : new URL(`${l.pathname || "/"}${l.search || ""}${l.hash || ""}`, "https://app.invalid");
    if (value) url.searchParams.set(word, value);
    else url.searchParams.delete(word);
    return `${url.pathname}${url.search}${url.hash}`;
  };
  const ownEntry = (): boolean => {
    const s = window.history.state as Partial<OverEntry> | null;
    return !!s && typeof s === "object" && s.over === word;
  };
  return {
    now,
    addressWith,
    open(value, move = false) {
      const was = now();
      if (was === value) return;
      const entry: OverEntry = { over: word, value };
      if (move && was !== null) window.history.replaceState(entry, "", addressWith(value));
      else window.history.pushState(entry, "", addressWith(value));
      say();
    },
    close() {
      if (now() === null) return;
      if (ownEntry()) window.history.back();
      else {
        window.history.replaceState(null, "", addressWith(null));
        say();
      }
    },
    hear(fn) {
      heard.add(fn);
      window.addEventListener("popstate", fn);
      // A page's move is the frame's own pushState, which no popstate says: the frame's address hears it.
      const off = hearPageMoves(fn);
      return () => {
        heard.delete(fn);
        window.removeEventListener("popstate", fn);
        off();
      };
    },
  };
}
