/**
 * What a slot box holds, read off its DOM (slot-box.tsx): the words as they are stored, and a place in them for every
 * place the caret can stand. The box is a contenteditable the browser edits as a person types, so the DOM is what is
 * true and this reads it: text nodes are words, a chip is the slot it carries (`data-slot`, and `data-written` where the
 * words wrote it in some way but its key between plain braces: `{{01}}`), a line break is a newline, and what a browser makes of Enter when nothing stops it (a block, a stray break) is read as the newline it
 * means. The break the box ends with, which keeps a last empty line open for the caret, is no newline.
 *
 * A place is a number in the stored string, so a caret survives the box being drawn again and the editor can say
 * where a value goes. All of it is pure over what it is handed (a node's type, name, value, children and one
 * attribute), which is what a test hands it, and the three that touch the page (the selection, the range) are in
 * slot-box-edits.ts.
 */
import { slotWritten, toSlotParts } from "@chanlytics/contracts";
import type { SlotKey, SlotSet } from "@chanlytics/contracts";

const TEXT_NODE = 3;
/** The elements a browser makes of a new line when Enter is let through: each starts a line of its own. */
const BLOCKS = new Set(["DIV", "P", "LI"]);

/** What of a DOM node the reading needs: a `Node` is one, and so is a plain object in a test. */
interface BoxNode<N> {
  nodeType: number;
  nodeName: string;
  nodeValue: string | null;
  childNodes: ArrayLike<N>;
  getAttribute?: (name: string) => string | null;
}

/** A place the caret can stand: a node and an offset in it, characters in a text node, children in anything else. */
interface BoxPoint<N> {
  node: N;
  offset: number;
}

/** One place the caret can stand, with the place it is in the stored words; a text node is one stop for its length. */
interface Stop<N> {
  node: N;
  offset: number;
  at: number;
  /** The characters of a text node, which its offsets run over; none for a place between two children. */
  width: number | null;
}

/** A slot the box draws, where it starts in the words, and how the words write it. */
interface BoxChip<N> {
  node: N;
  start: number;
  slot: SlotKey;
  written: string;
}

/** The box read: its words, and the places in them. */
interface BoxScan<N> {
  text: string;
  stops: Stop<N>[];
  chips: BoxChip<N>[];
}

/** The slot a node draws, by the key it carries (a number's digits, or a name): null for any other node. */
function slotOf<N extends BoxNode<N>>(node: N): SlotKey | null {
  const given = node.getAttribute?.("data-slot");
  return given === null || given === undefined || given === "" ? null : given;
}

/** How the words write the slot a chip draws: the spelling it carries, else its key between plain braces. */
function writtenOf<N extends BoxNode<N>>(node: N, slot: SlotKey): string {
  const given = node.getAttribute?.("data-written");
  return given === null || given === undefined || given === "" ? slotWritten(slot) : given;
}

/** Whether `inner` is `outer` or in it. */
function within<N extends BoxNode<N>>(outer: N, inner: N): boolean {
  if (outer === inner) return true;
  return Array.from(outer.childNodes).some((child) => within(child, inner));
}

/**
 * Reads the box in order: each text node's characters, each chip as its slot, each line break as a newline (the last
 * child's is the box's own, not a line), each block after the first thing as a newline of its own.
 */
export function scanBox<N extends BoxNode<N>>(root: N): BoxScan<N> {
  const scan: BoxScan<N> = { text: "", stops: [], chips: [] };
  const visit = (node: N, lastOfBlock: boolean): void => {
    if (node.nodeType === TEXT_NODE) {
      const data = node.nodeValue ?? "";
      scan.stops.push({ node, offset: 0, at: scan.text.length, width: data.length });
      scan.text += data;
      return;
    }
    const slot = slotOf(node);
    if (slot !== null) {
      const written = writtenOf(node, slot);
      scan.chips.push({ node, start: scan.text.length, slot, written });
      scan.text += written;
      return;
    }
    if (node.nodeName === "BR") {
      if (!lastOfBlock) scan.text += "\n";
      return;
    }
    const block = node !== root && BLOCKS.has(node.nodeName);
    if (block && scan.text.length > 0) scan.text += "\n";
    const kids = Array.from(node.childNodes);
    kids.forEach((child, i) => {
      scan.stops.push({ node, offset: i, at: scan.text.length, width: null });
      visit(child, i === kids.length - 1);
    });
    scan.stops.push({ node, offset: kids.length, at: scan.text.length, width: null });
  };
  visit(root, false);
  return scan;
}

/** Where in the words a place in the DOM is: null for a place outside the box. A place inside a chip is before it. */
export function offsetIn<N extends BoxNode<N>>(scan: BoxScan<N>, point: BoxPoint<N>): number | null {
  const stop = scan.stops.find((s) => s.node === point.node && (s.width !== null || s.offset === point.offset));
  if (stop) return stop.at + (stop.width === null ? 0 : Math.max(0, Math.min(stop.width, point.offset)));
  const chip = scan.chips.find((c) => within(c.node, point.node));
  return chip ? chip.start : null;
}

/**
 * The place in the DOM for a place in the words: the first the caret can stand in, which is the end of a run of words
 * before the slot that follows it and the start of the next after a slot, and before the box's last break at the end.
 * A place inside a slot's written form, where the caret never stands, is after the slot; a place past the words is
 * their end.
 */
export function pointIn<N extends BoxNode<N>>(scan: BoxScan<N>, at: number): BoxPoint<N> | null {
  const stop = scan.stops.find((s) => at >= s.at && at <= s.at + (s.width ?? 0));
  if (stop) return { node: stop.node, offset: stop.offset + at - stop.at };
  const inside = scan.chips.find((c) => at > c.start && at < c.start + c.written.length);
  if (inside) return pointIn(scan, inside.start + inside.written.length);
  const last = scan.stops[scan.stops.length - 1];
  return last ? { node: last.node, offset: last.offset + (last.width ?? 0) } : null;
}

/** What a selection says of its two ends, which is what the browser's Selection has. */
interface SelectionEnds<N> {
  anchorNode: N | null;
  anchorOffset: number;
  focusNode: N | null;
  focusOffset: number;
}

/** The selection as a place in the words, start before end; null where it is not in the box. */
export function selectionIn<N extends BoxNode<N>>(
  scan: BoxScan<N>,
  sel: SelectionEnds<N>,
): { start: number; end: number } | null {
  if (!sel.anchorNode || !sel.focusNode) return null;
  const a = offsetIn(scan, { node: sel.anchorNode, offset: sel.anchorOffset });
  const f = offsetIn(scan, { node: sel.focusNode, offset: sel.focusOffset });
  return a === null || f === null ? null : { start: Math.min(a, f), end: Math.max(a, f) };
}

/** How many slots the words hold that are typed as braces rather than drawn as chips: the box is to be drawn again. */
export function typedSlots<N>(scan: BoxScan<N>, set: Pick<SlotSet, "kind">): number {
  const written = toSlotParts(scan.text, set).filter((part) => part.kind === "slot").length;
  return Math.max(0, written - scan.chips.length);
}
