/**
 * Campaigns' ledger and the keyboard (decision 18): People's list keys, in the shape of its listener
 * (surfaces/people/hooks/keyboard.ts) and reading People's own rules for what is typing, what a control is and what
 * stands over the page (surfaces/people/words.ts). `/` goes to the search, J/K or ↓/↑ walk a cursor down the rows the
 * screen shows (focus goes to the row's name with it, so Tab reaches its acts and Enter opens it as a link does), Enter
 * opens the row under the cursor, Escape lets go of the words searched and then of the filter. Never while typing (but
 * Escape in the search box), never with a modifier, never behind a menu or a sheet.
 *
 * Focus comes home: a sheet opened from a row gives it, as it closes, to that row's opener
 * (`[data-row="<id>"] [data-row-open]`), one opened from a moment's card on the rail to the card's name, or where the row
 * is gone to the row now in its place, the last row or the search:
 * the kit's Sheet would give it to what held it when it opened, which an Edit that swapped one sheet for another has
 * taken away. An act decided in a row leaves it on the row's name, since the button that held it is gone. No focus here
 * scrolls the page (a phone jumped to the row): only the cursor and an arrival bring a row into view, by the least scroll
 * that shows it. And the marks a row wears for its next draw: decided in place, it settles once (the kit's save settle);
 * arrived (just made, just changed), it is scrolled to and washed once (the kit's wash of a changed line).
 */
import { useEffect, useRef, useState } from "react";
import { PL_CONTROL, PL_OVERLAY, plTyping } from "@/surfaces/people/words";

/** What the one listener reads, left by the page as its draw ends. */
interface LedgerKeyDoors {
  /** The rows the screen shows, in order. */
  ids: readonly string[];
  cursor: string | null;
  move: (step: number) => void;
  /** Open a row: its opener pressed, as a press on the row would. */
  open: (id: string) => void;
  focusSearch: () => void;
  /** Whether Escape has something to let go of: words searched, a status, a group. */
  narrowed: boolean;
  clearOne: () => void;
  /** A sheet stands over the page (the drawer, the composer): it has the keys. */
  sheetOpen: boolean;
}

/** The search box's own id: Escape typed there lets go of the words, which a typing box otherwise keeps. */
const SEARCH_ID = "cmh-ledger-search";

/** A row's own selector, by its id, quoted for an attribute's value. */
const rowSelector = (id: string): string => `[data-row="${id.replace(/["\\]/g, "\\$&")}"]`;

/** A row's opener, by its id: the name a press anywhere on the row presses (parts/head.tsx cmRowPress). */
export const rowOpener = (id: string): string => `${rowSelector(id)} [data-row-open]`;

/** The page's one element for a selector, where there is a document to ask. */
function found(selector: string): HTMLElement | null {
  if (typeof document === "undefined" || !("querySelector" in document)) return null;
  return document.querySelector<HTMLElement>(selector);
}

/** Once the page has drawn what it is about to: after a sheet closes, after a row is decided. */
function afterDraw(run: () => void): void {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else run();
}

/**
 * Focus that keeps the page where it is. A plain focus scrolls an element out of sight to the middle of the screen, so a
 * phone jumped to a row the person never saw (a drawer reached by its address, closing).
 */
function focusStill(el: HTMLElement | null): void {
  el?.focus({ preventScroll: true });
}

/** Focus to a row's opener, once the page has drawn, the page held still: a row decided where it stands. */
function focusRowOpener(id: string): void {
  afterDraw(() => focusStill(found(rowOpener(id))));
}

/**
 * A row walked to or just arrived: its opener takes the focus, and the row is brought into view by the least scroll that
 * shows it, as People's cursor walks its rows (people/hooks/use-place.ts).
 */
function bringRowToView(id: string): void {
  afterDraw(() => {
    focusStill(found(rowOpener(id)));
    found(rowSelector(id))?.scrollIntoView({ block: "nearest" });
  });
}

/** A row's opener pressed: what Enter does to the row under the cursor. */
export function pressRowOpener(id: string): void {
  found(rowOpener(id))?.click();
}

/** A key typed in a box: only Escape in the ledger's own search is the ledger's. */
function typingKey(k: LedgerKeyDoors, e: KeyboardEvent, from: Element | null): void {
  if (e.key !== "Escape" || !k.narrowed || from?.getAttribute?.("data-testid") !== SEARCH_ID) return;
  e.preventDefault();
  k.clearOne();
}

/** A key that walks or opens the rows. Enter and Space on a focused button, link or tab are that control's. */
function rowKey(k: LedgerKeyDoors, e: KeyboardEvent, from: Element | null): void {
  if ((e.key === "Enter" || e.key === " ") && from?.closest?.(PL_CONTROL)) return;
  const down = e.key === "ArrowDown" || e.key === "j" || e.key === "J";
  const up = e.key === "ArrowUp" || e.key === "k" || e.key === "K";
  // A held key walks on; a held Enter opens once.
  if (e.repeat && !(down || up)) return;
  if (down || up) {
    e.preventDefault();
    k.move(down ? 1 : -1);
  } else if (e.key === "Enter" && k.cursor) {
    e.preventDefault();
    k.open(k.cursor);
  }
}

/** A key on the page: the ledger's, or nothing. */
export function onLedgerKey(k: LedgerKeyDoors | null, e: KeyboardEvent): void {
  // Where the key was pressed, not where focus is now: a field's own Escape can take the focus with it.
  const from = e.target && (e.target as Node).nodeType === 1 ? (e.target as Element) : document.activeElement;
  if (!k || e.defaultPrevented || k.sheetOpen || e.metaKey || e.ctrlKey || e.altKey) return;
  if (plTyping(from)) {
    typingKey(k, e, from);
    return;
  }
  // A menu, Ask, the notifications or the kit's sheet open over the page has the keys.
  if (found(PL_OVERLAY)) return;
  if (e.key === "/") {
    e.preventDefault();
    k.focusSearch();
    return;
  }
  if (e.key === "Escape") {
    if (k.narrowed) {
      e.preventDefault();
      k.clearOne();
    }
    return;
  }
  if (k.ids.length > 0) rowKey(k, e, from);
}

/** The page's one listener for its life, reading what the latest draw left (People's usePlPlace). */
export function useLedgerKeys(doors: LedgerKeyDoors): void {
  const keys = useRef<LedgerKeyDoors | null>(null);
  useEffect(() => {
    keys.current = doors;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onLedgerKey(keys.current, e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** The cursor over the rows the screen shows: none until a key moves it; a row that leaves the screen takes it away. */
export function useLedgerCursor(ids: readonly string[]): { cursor: string | null; move: (step: number) => void } {
  const [cursor, setCursor] = useState<string | null>(null);
  const at = cursor !== null && ids.includes(cursor) ? cursor : null;
  const move = (step: number) => {
    const from = at === null ? (step > 0 ? -1 : ids.length) : ids.indexOf(at);
    const next = ids[Math.min(ids.length - 1, Math.max(0, from + step))];
    if (next === undefined) return;
    setCursor(next);
    bringRowToView(next);
  };
  return { cursor: at, move };
}

/**
 * The row a sheet was opened from: its id, and where it stood among the rows shown; and the card it was opened from on
 * the rail, where it was (its name's selector), which comes before the row.
 */
type CameFrom = { id: string; at: number; card: string | null };

/** The search, or on a phone the circle that opens it: where focus goes when no row is left to take it. */
const SEARCH_OR_CIRCLE = `[data-testid="${SEARCH_ID}"], [data-testid="cmh-phone-find"]`;

/** A row's opener by its id, where the row is drawn and has one (the receptionist has none). */
const openerOf = (id: string | undefined): HTMLElement | null => (id === undefined ? null : found(rowOpener(id)));

/** A moment's card's name on the rail, by its moment (rail.tsx Stage): the door to its lead's drawer. */
const cardOpener = (stage: string): string =>
  `.cmh-stage[data-stage="${stage.replace(/["\\]/g, "\\$&")}"] [data-row-open]`;

/**
 * Where focus comes home as a sheet closes: the card's name where a card opened it; else the row's own name; else, the
 * row gone (deleted, or out of the tab), the name of the row now in its place; else the last row's; else the search.
 * Never the page's body, which sends the next Tab, and a screen reader, back to the top of the page (legacy-verbs
 * editorBox).
 */
function homeOf(from: CameFrom, ids: readonly string[]): HTMLElement | null {
  return (
    (from.card === null ? null : found(from.card)) ??
    openerOf(from.id) ??
    openerOf(ids[Math.min(from.at, ids.length - 1)]) ??
    openerOf(ids[ids.length - 1]) ??
    found(SEARCH_OR_CIRCLE)
  );
}

/**
 * The row a sheet was opened from gets the focus back as the sheet closes, the page held still. `open`: the row the open
 * sheet is about; `ids`: the rows the screen shows, in order. Only a sheet opened from a row shown here, or from a
 * moment's card, comes home: one open as the page is first drawn (reached by its address: Today, the bell, a reload) was
 * opened from nothing the person saw, and gives nothing back.
 *
 * It answers how a card says it opened the next drawer (`fromCard(id, stage)`, as its name is pressed): the drawer about
 * that campaign then comes home to the card, never to the campaign's row in the ledger under it. A card noted for
 * another campaign (its press opened a tab instead) is let go of by the next drawer.
 */
export function useFocusComesHome(open: string | null, ids: readonly string[]): (id: string, stage: string) => void {
  const was = useRef(open);
  const from = useRef<CameFrom | null>(null);
  const card = useRef<{ id: string; stage: string } | null>(null);
  useEffect(() => {
    if (open === was.current) return;
    was.current = open;
    if (open !== null) {
      const at = ids.indexOf(open);
      const by = card.current && card.current.id === open ? cardOpener(card.current.stage) : null;
      card.current = null;
      if (by !== null || at >= 0) from.current = { id: open, at, card: by };
      return;
    }
    const came = from.current;
    from.current = null;
    if (came) afterDraw(() => focusStill(homeOf(came, ids)));
  }, [open, ids]);
  return (id, stage) => {
    card.current = { id, stage };
  };
}

/** What a row wears for its next draw: decided in place (it settles once), or arrived (scrolled to, washed once). */
export type RowMark = { id: string; kind: "settled" | "arrived" } | null;

/**
 * The page's marks: one row at a time, the last one marked, until it is let go of (`clear`). An arrival is only marked
 * here: a campaign just made has no row until the playbooks are read again, so it is scrolled to when its row is drawn
 * (`useArrivalLands`). `sheetOpen`: whether a sheet stands over the ledger. A campaign saved from a sheet is held until
 * none does (a change made from a row's drawer closes back to that drawer): marked behind it, its row was scrolled to and
 * washed where nobody saw it, and nothing moved as the drawer closed (spec 2026-10-09 §4.6). A sheet opened over an
 * arrival lets go of it: the row is drawn plain behind the sheet, so the next arrival, the same campaign saved again, is
 * drawn anew and washed again.
 */
export function useRowMarks(sheetOpen: boolean): {
  mark: RowMark;
  settle: (id: string) => void;
  arrive: (id: string) => void;
  clear: () => void;
} {
  const [mark, setMark] = useState<RowMark>(null);
  const [held, setHeld] = useState<string | null>(null);
  useEffect(() => {
    if (sheetOpen) {
      if (mark && mark.kind === "arrived") setMark(null);
      return;
    }
    if (held === null) return;
    setHeld(null);
    setMark({ id: held, kind: "arrived" });
  }, [sheetOpen, held]); // eslint-disable-line react-hooks/exhaustive-deps -- a sheet's coming and going, and a save, alone say when
  const settle = (id: string) => {
    setMark({ id, kind: "settled" });
    focusRowOpener(id);
  };
  return { mark, settle, arrive: setHeld, clear: () => setMark(null) };
}

/**
 * An arrival is scrolled to, and its name takes the focus, once, the first draw its row is among the rows shown. Let go
 * of, it lands again when it is given again: the same campaign saved a second time.
 */
export function useArrivalLands(mark: RowMark, ids: readonly string[]): void {
  const landed = useRef<string | null>(null);
  const arrived = mark && mark.kind === "arrived" ? mark.id : null;
  const here = arrived !== null && ids.includes(arrived);
  useEffect(() => {
    if (arrived === null) {
      landed.current = null;
      return;
    }
    if (!here || landed.current === arrived) return;
    landed.current = arrived;
    bringRowToView(arrived);
  }, [arrived, here]);
}

/**
 * Let go of something when a key changes after the first draw: the page lets go of a row's mark when the list's filter
 * changes (the status, the group and the words, as one key), so a row decided under a tab stays shown until then.
 */
export function useLetGo(key: string, letGo: () => void): void {
  const was = useRef(key);
  useEffect(() => {
    if (was.current === key) return;
    was.current = key;
    letGo();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- the key alone says when
}
