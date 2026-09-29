/**
 * The kit's list row (kit.css, "List row"): People's row on a phone, which every list's row copies part for part. The
 * face beside up to three lines: the name, and what trails it, on the first; what was said on the second; the facts on
 * the third; and a line of its own under them where a page has one more thing to say. The lines after the first take
 * the grid's next rows, so the row draws them in that order, and a line with nothing to say is not drawn. What each
 * line says is the page's. `className` is for the page's layout, and comes last; the ref reaches the element.
 *
 * A row with a page of its own is a link to it, given `href` (the shell's "a door is a link", data-bits `routeDoor`),
 * which kit.css draws in the row's colours with no underline. What a press on any other row does (select it, open a
 * pane beside the list) is the page's, on the row itself: its handler, role and state pass through to the <div>. A
 * row is never put inside a button, which may not hold its lines.
 *
 * It draws what the gallery's List row family draws, entry for entry (tooling/scripts/e2e-harness/kit-gallery.mjs;
 * tooling/scripts/tests/styles/kit-components.test.mjs holds the two together).
 */
import type { ComponentPropsWithRef, ReactNode } from "react";
import type { FaceProps } from "./face";
import { Face } from "./face";
import { cx } from "./variants";

/** Whether a line or a fact has something to draw: nothing, false and no words draw none. */
const drawsSomething = (node: ReactNode) => node !== undefined && node !== null && node !== false && node !== "";

/** Words, which the row draws in an element of its own; anything else is an element the page drew. */
const isWords = (node: ReactNode) => typeof node === "string" || typeof node === "number";

/** The row's lines, which are its props: it takes no children. */
type ListRowLines = {
  /** Who the row is: the kit's face, in the row's first column. */
  face: FaceProps;
  /** The first line. */
  name: ReactNode;
  /**
   * What trails the name, a pill, a time or a count: the page's own element, drawn with the class the row hands it,
   * which stands it at the row's end. It is the row's child, never wrapped, so the row lays it out as People's row
   * lays out its pill.
   */
  end?: (place: string) => ReactNode;
  /**
   * What was said, on the second line: what to say, which the row draws in the line's element; or the page's own
   * element for the line (its class, its test id), drawn with the class the row hands it, as what trails is. Without
   * it, the face spans the name and the facts.
   */
  said?: ReactNode | ((place: string) => ReactNode);
  /**
   * The facts, in order: words in a span each, and an element the page drew as it is, the line's own flex item, so
   * its class and test id stand where the line lays it out. A fact of nothing is not drawn; with none, no line is.
   */
  facts?: readonly ReactNode[];
  /** A line of its own, under the facts. */
  note?: ReactNode;
};

/** What the row is drawn on, and so what its ref holds: a div, or a link where it has a page of its own. */
type ListRowElement =
  | (Omit<ComponentPropsWithRef<"div">, "children"> & { href?: undefined })
  | (Omit<ComponentPropsWithRef<"a">, "children"> & { href: string });

/** A row of a list: its lines, and the element it is drawn on. */
export type ListRowProps = ListRowLines & ListRowElement;

/** The second line: the page's own element, with the line's class, or what to say in the row's element for it. */
function saidLine(said: ListRowLines["said"]) {
  if (typeof said === "function") return said("list-row-said");
  return drawsSomething(said) ? <div className="list-row-said">{said}</div> : null;
}

/** The facts' line, of those that say something: words in a span each, an element as the page drew it. */
function factsLine(facts: readonly ReactNode[]) {
  const shown = facts.filter(drawsSomething);
  if (shown.length === 0) return null;
  return (
    <div className="list-row-facts">
      {shown.map((fact, at) => (isWords(fact) ? <span key={at}>{fact}</span> : fact))}
    </div>
  );
}

/** A row of a list: its face, its lines, and what trails its name; a link where it has an address. */
export function ListRow({ face, name, end, said, facts = [], note, className, ...element }: ListRowProps) {
  const classes = cx("list-row", className);
  const lines = (
    <>
      <Face {...face} className={cx("list-row-face", face.className)} />
      <div className="list-row-name">{name}</div>
      {end?.("list-row-end")}
      {saidLine(said)}
      {factsLine(facts)}
      {drawsSomething(note) ? <div className="list-row-note">{note}</div> : null}
    </>
  );
  if (element.href !== undefined) {
    return (
      <a {...element} className={classes}>
        {lines}
      </a>
    );
  }
  const { href: _none, ...div } = element;
  return (
    <div {...div} className={classes}>
      {lines}
    </div>
  );
}
