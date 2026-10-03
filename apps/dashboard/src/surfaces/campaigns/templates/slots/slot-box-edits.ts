/**
 * What a person does in a slot box that the browser would do wrongly, or not at all, for words with slots in them
 * (slot-box.tsx): Enter, a paste, a cut, Backspace against a slot, a slot typed as braces, a limit, undo. Each reads the
 * box, changes the one thing it must in place (a newline or pasted words as a text node at the caret, a slot's chip taken
 * out as one node) and says what the box holds now, or, where slots were typed as braces or the words went past their
 * limit, asks for the box to be drawn again with chips in their place and the words kept to it. The browser's own typing,
 * caret movement and deletion of words are left to it; so is the page's (a value put in by its name, which the editor does,
 * and which also draws the box again). Undo and redo are the box's own (slot-history.ts): what is done in place is known to
 * no browser's undo stack, so each edit is told to the history and a step back is drawn as the box again.
 *
 * The reading is slot-dom.ts's, over pure nodes (slot-box-dom.test.mjs), and the words are contracts' (message-version-
 * slots.test.mjs). What is here touches the page's selection and range, which only a browser runs: it was run in
 * Chromium and in WebKit (typing around a slot, Backspace and Delete at one, Shift and the arrows over one, Enter, a
 * paste, a cut and paste back, a value put in from the menu, an input method's word, the subject's limit).
 */
import { clampWords, eraseSlot } from "@chanlytics/contracts";
import type { SlotEdit, SlotSet } from "@chanlytics/contracts";
import { offsetIn, pointIn, scanBox, selectionIn, typedSlots } from "./slot-dom";
import type { HistoryKeeper } from "./slot-history";

/** What an edit needs of the box it is made in: how it is limited, and who it tells. */
export interface BoxContext {
  /** How its slots are written: numbered, or named. */
  set: Pick<SlotSet, "kind">;
  /** One for a line of words (the subject: no Enter), more for a box of sentences. */
  lines: number;
  maxLength: number | undefined;
  readOnly: boolean;
  /** An input method is mid-word: the box is not drawn again under it. */
  composing: boolean;
  onValueChange: (words: string) => void;
  onRepaint: (edit: SlotEdit) => void;
  /** The box's undo: told of each edit, asked for a step back or forward. It outlives the box, which is drawn again. */
  history: HistoryKeeper;
  /** A step of the history is to be drawn: the box again, at these words and caret. It is no new edit. */
  onRestore: (edit: SlotEdit) => void;
}

/** The box's selection as a place in its words, start before end; null where the caret is not in it. */
export function selectionOf(el: HTMLElement): { start: number; end: number } | null {
  const sel = el.ownerDocument.getSelection();
  return sel ? selectionIn(scanBox<Node>(el), sel) : null;
}

/** The box focused with its caret at a place in its words. */
export function placeCaret(el: HTMLElement, at: number): void {
  el.focus();
  const doc = el.ownerDocument;
  const point = pointIn(scanBox<Node>(el), at);
  const sel = doc.getSelection();
  if (!point || !sel) return;
  const range = doc.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Says what the box holds now, and tells its history. Where slots were typed as braces, or the words went past their limit
 * in a way that could not be refused (an input method's word, a spelling the browser put in: only typing is stopped
 * before it is typed), it asks to be drawn again instead, each slot as its chip and the words cut back from where the
 * caret is. An input method is let finish first.
 */
export function settle(el: HTMLElement, ctx: BoxContext): void {
  const scan = scanBox<Node>(el);
  const sel = selectionOf(el);
  const caret = sel ? sel.end : scan.text.length;
  const over = ctx.maxLength !== undefined && scan.text.length > ctx.maxLength;
  if (!ctx.composing && (over || typedSlots(scan, ctx.set) > 0)) {
    const edit =
      ctx.maxLength === undefined ? { text: scan.text, caret } : clampWords(scan.text, caret, ctx.maxLength, ctx.set);
    ctx.history.record(edit.text, edit.caret);
    ctx.onRepaint(edit);
    return;
  }
  ctx.history.record(scan.text, caret);
  ctx.onValueChange(scan.text);
}

/** How many more characters the box may take with what is selected given up: unlimited with no limit. */
function roomLeft(el: HTMLElement, ctx: BoxContext): number {
  if (ctx.maxLength === undefined) return Infinity;
  const held = scanBox<Node>(el).text.length;
  const sel = selectionOf(el);
  return ctx.maxLength - (held - (sel ? sel.end - sel.start : 0));
}

/** Words as the box takes them: line endings as newlines, or, in a line of words, as a space. */
const tidy = (words: string, lines: number): string =>
  lines > 1 ? words.replace(/\r\n?/g, "\n") : words.replace(/\s*[\r\n]+\s*/g, " ");

/**
 * Words put in place of the selection as typing them would: one text node at the caret, kept to what the box may hold.
 * `kind` is what the edit is called to the history: a paste, unless it is the newline Enter makes.
 */
export function putWords(el: HTMLElement, words: string, ctx: BoxContext, kind = "insertFromPaste"): void {
  const doc = el.ownerDocument;
  const sel = doc.getSelection();
  const at = selectionOf(el);
  if (ctx.readOnly || !sel || sel.rangeCount === 0 || !at) return;
  const put = tidy(words, ctx.lines).slice(0, Math.max(0, roomLeft(el, ctx)));
  const range = sel.getRangeAt(0);
  if (put === "" && range.collapsed) return;
  ctx.history.begin(kind, at.start);
  range.deleteContents();
  const node = doc.createTextNode(put);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  settle(el, ctx);
}

/** Backspace (back) or Delete (forward) against a slot takes it whole. True where it did, so the browser's own is not wanted. */
function eraseSlotAtCaret(el: HTMLElement, way: "back" | "forward", ctx: BoxContext): boolean {
  const scan = scanBox<Node>(el);
  const sel = selectionOf(el);
  const edit = sel ? eraseSlot(scan.text, sel.start, sel.end, way, ctx.set) : null;
  const chip = edit ? scan.chips.find((c) => c.start === edit.caret) : undefined;
  if (!chip) return false;
  chip.node.parentNode?.removeChild(chip.node);
  settle(el, ctx);
  return true;
}

/**
 * The browser's intent before it acts (the `beforeinput` event, which says what kind of edit it is): a saving box takes
 * none, formatting is never wanted, undo and redo are the box's own, Enter is a newline in a box of sentences and nothing
 * in a line, a slot goes whole, and a typed character past the limit is not typed. Every other edit is told to the history
 * as it begins, for the input event that follows to complete.
 */
export function onBeforeInput(e: InputEvent, el: HTMLElement, ctx: BoxContext): void {
  const kind = e.inputType;
  if (ctx.readOnly || kind.startsWith("format")) {
    e.preventDefault();
  } else if ((kind === "historyUndo" || kind === "historyRedo") && !ctx.composing) {
    e.preventDefault();
    stepHistory(kind === "historyUndo" ? "undo" : "redo", ctx);
  } else if (kind === "insertParagraph" || kind === "insertLineBreak") {
    e.preventDefault();
    if (ctx.lines > 1) putWords(el, "\n", ctx, kind);
  } else {
    ctx.history.begin(kind, selectionOf(el)?.start ?? 0);
    if (kind === "deleteContentBackward" || kind === "deleteContentForward") {
      if (eraseSlotAtCaret(el, kind === "deleteContentBackward" ? "back" : "forward", ctx)) e.preventDefault();
    } else if (kind === "insertText" && e.data && roomLeft(el, ctx) < e.data.length) {
      e.preventDefault();
    }
  }
}

/** One step back or forward in the box's own history, which is drawn as the box again. */
function stepHistory(way: "undo" | "redo", ctx: BoxContext): void {
  const to = ctx.history.step(way);
  if (to) ctx.onRestore(to);
}

/**
 * Ctrl or Cmd with Z is undo, with Shift redo, and Ctrl Y redo: the keys are the box's own too, since a browser whose
 * undo stack has nothing to say says no `historyUndo` for them, and then its own would do nothing, or the wrong thing.
 * A saving box and an input method are left alone.
 */
export function historyKey(e: KeyPress, ctx: BoxContext): void {
  if (ctx.composing || e.altKey || !(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  const way = key === "z" ? (e.shiftKey ? "redo" : "undo") : key === "y" && e.ctrlKey && !e.shiftKey ? "redo" : null;
  if (way === null) return;
  e.preventDefault();
  if (!ctx.readOnly) stepHistory(way, ctx);
}

/** What a key press says of itself, which a React key event and the browser's both do. */
interface KeyPress {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
}

/**
 * Shift and an arrow at a slot takes the slot into the selection in one press. Chromium does it; WebKit takes two
 * presses to the left and none to the right (the selection stays where it is), so the box does it itself, the same in
 * every browser. It acts only where the moving end of the selection stands against a slot in the way the arrow goes
 * (the other way round in a right-to-left box); anywhere else the browser's own selection runs.
 */
export function extendOverSlot(e: KeyPress, el: HTMLElement): void {
  const arrow = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
  const doc = el.ownerDocument;
  const sel = doc.getSelection();
  if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || arrow === 0 || !sel?.focusNode) return;
  const way = doc.defaultView?.getComputedStyle(el).direction === "rtl" ? -arrow : arrow;
  const scan = scanBox<Node>(el);
  const at = offsetIn(scan, { node: sel.focusNode, offset: sel.focusOffset });
  const chip = scan.chips.find((c) => (way > 0 ? c.start : c.start + c.written.length) === at);
  const edge = chip ? pointIn(scan, way > 0 ? chip.start + chip.written.length : chip.start) : null;
  if (!edge) return;
  e.preventDefault();
  sel.extend(edge.node, edge.offset);
}

/**
 * A copy or a cut of the selection as the stored words, so a slot copied is a slot pasted (and `{{1}}` is what leaves
 * the box, never the chip's name). True where it handled the event; a cut takes the words out too.
 */
export function copyWords(el: HTMLElement, data: DataTransfer | null, cut: boolean, ctx: BoxContext): boolean {
  const sel = selectionOf(el);
  if (!data || !sel || sel.start === sel.end) return false;
  data.setData("text/plain", scanBox<Node>(el).text.slice(sel.start, sel.end));
  const taken = el.ownerDocument.getSelection();
  if (cut && !ctx.readOnly && taken && taken.rangeCount > 0) {
    ctx.history.begin("deleteByCut", sel.start);
    taken.getRangeAt(0).deleteContents();
    settle(el, ctx);
  }
  return true;
}
