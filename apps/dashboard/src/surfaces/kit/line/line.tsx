/**
 * What a conversation is pressed and typed through (kit.css, "The line"): the circle at a field's end, an answer's small
 * acts, the questions offered as chips, the rows and figures of an answer, the doors in its words, and the field that grows
 * with what is written. Ask's Line draws them. None is a Button's variant: a button has a height, a padding and a capsule's
 * glass, and these stand in a sentence or in a line of their own, each with no ground of a button's.
 *
 * Each draws what the gallery's Line family draws, entry for entry (tooling/scripts/e2e-harness/kit-gallery.mjs;
 * tooling/scripts/tests/styles/kit-components.test.mjs holds the two together). `className` is for the page's layout, and
 * comes last; the ref reaches the element.
 */
import type { ComponentPropsWithRef } from "react";
import type { PressAct } from "../press";
import { Press } from "../press";
import { cx, variants } from "../variants";

const pressClasses = variants({
  base: "",
  variants: {
    kind: {
      send: "line-send",
      talk: "line-send line-talk",
      act: "line-act",
      chip: "line-chip",
      next: "line-chip line-next",
      clear: "line-clear",
      attach: "line-attach",
      remove: "line-remove",
      fold: "line-fold",
      letgo: "line-letgo",
      latest: "line-latest",
      row: "line-item",
      figure: "line-figure",
      door: "line-door",
      open: "line-open",
      words: "line-words",
    },
  },
});

/**
 * Its kinds. `send`, the ink circle at a field's end, faint until there are words; `talk`, the same circle as the mic; `act`,
 * a quiet glyph under an answer; `chip`, a question offered; `next`, one that follows an answer, a tile before its words;
 * `clear`, the × in what a field is scoped to; `attach`, the + at a field's start; `remove`, a row's ×; `fold`, a card's whole head; `letgo`, the pill a held mic
 * is lifted from; `latest`, the pill back to the newest question; `row`, a line of an answer that opens what it names;
 * `figure`, a number that says where it comes from; `door`, the glyph that goes there; `open`, the underlined word after a
 * source; `words`, a row named in the answer's own words.
 */
type LinePressKind =
  | "send"
  | "talk"
  | "act"
  | "chip"
  | "next"
  | "clear"
  | "attach"
  | "remove"
  | "fold"
  | "letgo"
  | "latest"
  | "row"
  | "figure"
  | "door"
  | "open"
  | "words";

/** A press of the line: its kind, and whether the keys stand on it (`selected`) or what it says is on (`on`). */
export type LinePressProps = { kind: LinePressKind; selected?: boolean; on?: boolean } & PressAct;

/** A press of the line. It acts where it stands: what opens a page here goes by the Line's own move, which keeps Ask open. */
export function LinePress({ kind, selected, on, className, children, ...element }: LinePressProps) {
  return (
    <Press {...element} className={cx(pressClasses({ kind }), selected && "sel", on && "on", className)}>
      {children}
    </Press>
  );
}

/** The field: one line that grows with its words, and takes the accent in its placeholder while a mic listens. */
export type LineFieldProps = { listening?: boolean } & ComponentPropsWithRef<"textarea">;

/** The field a conversation is typed in. It holds no box of its own: the page's band is its ground. */
export function LineField({ listening, className, ...field }: LineFieldProps) {
  return (
    <textarea {...field} className={cx("line-field", className)} data-listening={listening ? "true" : undefined} />
  );
}
