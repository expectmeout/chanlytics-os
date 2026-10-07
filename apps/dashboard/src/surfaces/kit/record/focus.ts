/**
 * What the fold, the inline editor and the sheet share: focus in and back, the window's width and its keys (moved whole
 * from legacy/components/record-fold.jsx, decision 0015).
 *
 * The first thing in an opened gesture a person would type into or press: the first of its fields' tab stops inside
 * `inner`, never a tip (the mark that explains a label comes before its box) and never its Save or Cancel, with the
 * caret at the end of what is there (spec §9); failing that, `fallback`.
 *
 * Focus inside a gesture, once, for every page that draws one, in three parts a gesture takes whole (useRecFocus: a fold,
 * an inline editor) or in part (the sheet, sheet.tsx, which enters and leaves as a modal dialog does and keeps the other
 * two).
 *
 * As it opens, focus moves to the first thing in it, since the act that opened it has gone; as it closes, focus that
 * went with it comes back to that row's act (data-rec-act).
 *
 * While it is open, focus that WENT WITH SOMETHING comes back into it (useRecFocusHold). The thing focus was on can leave
 * the page under it: an ask answered "Keep editing" (its "Yes" held focus), the last shift's remove, an Add that turns
 * into the sentence for a full list, an item of a menu that closes, a sheet's Undo left where a row was, or a toast's
 * Undo that takes its toast away. Each left a keyboard at the top of the document. After every draw, if the last thing in
 * the gesture to take focus is no longer in the document and focus is on nothing, focus goes to where the person was:
 * the last of its FIELDS focus was in (never the ask, nor Save and Cancel, nor the head's Close, nor a plain press among
 * the fields), its caret where it was left, or the first field when that has gone too.
 *
 * Only then. Focus a person moved themselves stays where they put it: the box they are typing in when a keystroke takes
 * an ask away (moved to the first field, as this first did whenever an ask went, the caret jumped after one letter), and
 * the page itself when they clicked away from the gesture, which a redraw must not undo.
 *
 * And a row a list has just been given takes focus in its first box (useRecFocusOn, `focusOn`: { row }, the row's
 * data-rec-row), since the Add that made it is where focus was, and the next thing a person does is type into the row.
 *
 * `inner` is the selector of the part that holds the gesture's fields (a selector list takes several parts), and
 * `fallback` the selector of what takes focus when it holds none.
 */
import { useEffect, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, RefObject } from "react";
import { can, pick } from "./dom";
import { recFolds } from "./registry";
import type { FoldId } from "./registry";
import { listen, mediaQuery, tabStops, unlisten } from "./shell-verbs";

/** The element a gesture is drawn in, held by a ref. */
type Box = RefObject<HTMLElement | null>;
/** A row a list has just been given, by its data-rec-row: a new object each time, so the same row named twice is focused twice. */
export interface FocusOn {
  row: string;
}

const recFocusIn = (el: HTMLElement | null, inner: string, fallback: string | null = null) => {
  if (!el || !can(el, "querySelector")) return;
  const within = pick(el, inner);
  const stops = within ? tabStops(within) : [];
  const first =
    stops.find((c) => !c.classList.contains("rec-tip") && !c.closest(".rec-foot")) ||
    (fallback ? pick(el, fallback) : null);
  if (!first || !first.focus) return;
  first.focus();
  const field = first as HTMLInputElement;
  if (typeof field.value === "string" && field.setSelectionRange) {
    try {
      field.setSelectionRange(field.value.length, field.value.length);
    } catch {
      /* a box that holds no caret */
    }
  }
};
// Gone from under the person: taken out of the document (an ask's own button, a removed row), or still in it and
// hidden. The second is not the same thing said twice. An Add that fills a list to its cap is not removed -- the box
// it was in is hidden and the sentence that says why stands where it was -- and the browser blurs a hidden box to the
// document, which is the one place focus must never be left. Reading only document.contains, the hold below saw the
// box still there and left the keyboard at the top of the page (measured in the Playwright journey,
// e2e/settings/settings-business.spec.ts, on the eighth language).
const recGone = (el: HTMLElement | null) =>
  !el || !document.contains || !document.contains(el) || !!(el.closest && el.closest("[hidden]"));
// Focus is on nothing a person put it on: nothing at all, the page itself, or something that has left the document (an
// ask's own button, gone with the ask).
const recFocusLost = () => {
  const now = document.activeElement;
  return !now || now === document.body || !!(document.contains && !document.contains(now));
};
// Closed, or gone: focus that went with it (it is on nothing, or still inside it) comes back to the act of the row it
// opened from. Focus a person has put somewhere else stays there.
const recFocusBack = (id: FoldId, el: HTMLElement | null) => {
  const now = document.activeElement;
  const lost = recFocusLost() || (el && el.contains && el.contains(now));
  if (!lost || !can(document, "querySelector")) return;
  const back = pick(document, `[data-rec-act="${id}"]`);
  if (back && back.focus) back.focus();
};

export function useRecFocusHold(open: boolean, box: Box, inner: string, fallback: string | null) {
  const last = useRef<HTMLElement | null>(null);
  // The last thing inside the gesture to take focus, a field or not.
  const had = useRef<HTMLElement | null>(null);
  // After every draw: no inputs, so it runs each time.
  useEffect(() => {
    const went = had.current;
    if (!open || !went || !recGone(went)) return;
    had.current = null;
    // Focus is still ON the thing that has just gone from under it: a box hidden rather than removed keeps it until
    // the browser's next rendering update, which is after this effect, and then hands it to the document. Moved here,
    // there is nothing left for the browser to blur. Focus a person moved themselves is elsewhere by now, and stays.
    if (!recFocusLost() && document.activeElement !== went) return;
    const el = box.current;
    const back = last.current;
    const there =
      back &&
      typeof back.focus === "function" &&
      el &&
      typeof el.contains === "function" &&
      el.contains(back) &&
      !recGone(back);
    if (there) back.focus();
    else recFocusIn(el, inner, fallback);
  });
  return {
    // Closed, where the person was is forgotten with the draft.
    forget: () => {
      last.current = null;
      had.current = null;
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      const t = e && (e.target as HTMLElement | null);
      if (!t || !t.closest) return;
      had.current = t;
      if (!t.closest(inner) || t.closest(".confirm") || t.closest(".rec-foot")) return;
      // A field is where a person was; a plain press (a row's remove, Add, a menu's item) is what they did there, and is
      // often the very thing that has gone. A switch or a radio is a button that is a field.
      if (t.matches && t.matches("button:not([role])")) return;
      last.current = t;
    },
  };
}

export const useRecFocusOn = (open: boolean, box: Box, focusOn: FocusOn | null) =>
  useEffect(() => {
    const el = box.current;
    if (!open || !focusOn || !focusOn.row || !el || !can(el, "querySelector")) return;
    const row = pick(el, `[data-rec-row="${focusOn.row}"]`);
    const first = row ? tabStops(row)[0] : null;
    if (first && first.focus) first.focus();
    // a new object each time is the ask: the same row named twice is focused twice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusOn]);

/** Where a gesture's fields are, and what takes focus when it holds none; `frame` names what drew it. */
interface FocusArea {
  inner: string;
  fallback: string | null;
  focusOn?: FocusOn | null;
  frame?: unknown;
}

// `frame` names what drew the gesture (a fold on a phone is a sheet): a new frame is a new element, and focus that was
// in the old one went with it, so it goes to the first thing in the new one, as it does on opening.
export function useRecFocus(id: FoldId, open: boolean, box: Box, area: FocusArea) {
  const { inner, fallback, focusOn = null, frame = null } = area;
  const hold = useRecFocusHold(open, box, inner, fallback);
  useEffect(() => {
    if (!open) {
      hold.forget();
      return undefined;
    }
    const el = box.current;
    recFocusIn(el, inner, fallback);
    return () => recFocusBack(id, el);
    // a new opening, a new id or a new frame: not each draw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id, frame]);
  useRecFocusOn(open, box, focusOn);
  return hold.onFocus;
}

// A gesture whose page goes away (the rail's "Yes, leave" replaces the pane) lets go of the registry: left as the open
// fold, its dirty check would go on answering after it had gone, and the rail would ask on every tab and the browser
// before every reload. The registry counts what is on the page by id (drawn), so one that comes straight back
// (StrictMode, in development) or comes back as a new instance (a key change, a new parent) keeps hold. One closed, or
// given way to another, before it goes is no longer the open one, and leaves it alone.
export const useRecDrawn = (id: FoldId) => useEffect(() => recFolds.drawn(id), [id]);

// Whether the window is a phone's: the kit's one breakpoint, record.css's `max-width: 760px`, read as Reports reads it
// and kept current as the window changes size.
const REC_PHONE_QUERY = "(max-width: 760px)";
export const recPhoneQuery = () => mediaQuery(REC_PHONE_QUERY);
export function useRecPhone() {
  const [phone, setPhone] = useState(() => {
    const q = recPhoneQuery();
    return !!(q && q.matches);
  });
  useEffect(() => {
    const q = recPhoneQuery();
    if (!q || !q.addEventListener) return undefined;
    const on = (e: MediaQueryListEvent) => setPhone(!!e.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return phone;
}

// A modal sheet's Escape from anywhere, while `on`: from inside it, the sheet's own keys take it first and say so
// (defaultPrevented); with focus on the page's body, where nobody put it, the key is still the sheet's. `cancel` is read
// as the key arrives, and null (a save that is out) cancels nothing. The listener is on only while the sheet is; the
// hook is called whether or not it is.
export function useRecSheetEscape(on: boolean, cancel: (() => void) | null | undefined) {
  const latest = useRef(cancel);
  latest.current = cancel;
  useEffect(() => {
    if (!on) return undefined;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || !latest.current) return;
      e.preventDefault();
      latest.current();
    };
    listen("keydown", onKey);
    return () => unlisten("keydown", onKey);
  }, [on]);
}

/** What a gesture's own keys need: what Escape cancels, what Ctrl or Cmd with Enter saves, and whether either is refused. */
interface FoldKeys {
  onCancel?: (() => void) | null;
  onSave?: (() => void) | null;
  saving?: boolean;
  refused?: boolean;
}

// Escape cancels, unless something inside took the key first (a combobox's list closing); Ctrl or Cmd with Enter saves.
// Neither while it saves: the save is on its way and closes it when the server takes it, and a Cancel meanwhile would
// say the change was thrown away. Only its own keys: a portal's bubble through React from outside its DOM (a sheet
// drawn from a field inside it), and its Ctrl+Enter would save it.
export const recKeys =
  ({ onCancel, onSave, saving, refused }: FoldKeys) =>
  (e: KeyboardEvent<HTMLElement>) => {
    if (e.defaultPrevented || !e.currentTarget || !e.currentTarget.contains(e.target as Node)) return;
    if (e.key === "Escape" && onCancel && !saving) {
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSave && !saving && !refused) {
      e.preventDefault();
      onSave();
    }
  };
