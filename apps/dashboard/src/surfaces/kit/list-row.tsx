/**
 * The kit's list row (kit.css, "List row"): People's row on a phone, which every list's row copies part for part. The
 * face beside up to three lines: the name, and what trails it, on the first; what was said on the second; the facts on
 * the third; and a line of its own under them where a page has one more thing to say. The lines after the first take
 * the grid's next rows, so the row draws them in that order. What each line says is the page's. `className` is for the
 * page's layout, and comes last; the ref reaches the element.
 *
 * A row with a page of its own is a link to it, given `href` (the shell's "a door is a link", data-bits `routeDoor`),
 * which kit.css draws in the row's colours with no underline; any other row is a <div>. A row that selects is wrapped
 * by the page's control.
 *
 * It draws what the gallery's List row family draws, entry for entry (tooling/scripts/e2e-harness/kit-gallery.mjs;
 * tooling/scripts/tests/styles/kit-components.test.mjs holds the two together).
 */
import type { ComponentPropsWithRef, ReactNode } from "react";
import type { FaceProps } from "./face";
import { Face } from "./face";
import { cx } from "./variants";

/** Whether a line has something to draw: nothing, false and no words draw none. */
const drawsSomething = (node: ReactNode) => node !== undefined && node !== null && node !== false && node !== "";

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
  /** What was said, on the second line. Without it, the face spans the name and the facts. */
  said?: ReactNode;
  /** The facts, each in a span of its own, in order; a fact of nothing is not drawn. */
  facts: readonly ReactNode[];
  /** A line of its own, under the facts. */
  note?: ReactNode;
};

/** What the row is drawn on, and so what its ref holds: a div, or a link where it has a page of its own. */
type ListRowElement =
  | (Omit<ComponentPropsWithRef<"div">, "children"> & { href?: undefined })
  | (Omit<ComponentPropsWithRef<"a">, "children"> & { href: string });

type ListRowProps = ListRowLines & ListRowElement;

/** A row of a list: its face, its lines, and what trails its name; a link where it has an address. */
export function ListRow({ face, name, end, said, facts, note, className, ...element }: ListRowProps) {
  const classes = cx("list-row", className);
  const lines = (
    <>
      <Face {...face} className={cx("list-row-face", face.className)} />
      <div className="list-row-name">{name}</div>
      {end?.("list-row-end")}
      {drawsSomething(said) ? <div className="list-row-said">{said}</div> : null}
      <div className="list-row-facts">
        {facts.filter(drawsSomething).map((fact, at) => (
          <span key={at}>{fact}</span>
        ))}
      </div>
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
