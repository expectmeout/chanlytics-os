/**
 * The kit's list row (kit.css, "List row"): People's row on a phone, which every list's row copies part for part. The
 * face beside up to three lines: the name, and what trails it, on the first; what was said on the second; the facts on
 * the third; and a line of its own under them where a page has one more thing to say. The lines after the first take
 * the grid's next rows, so the row draws them in that order. What each line says is the page's. `className` is for the
 * page's layout, and comes last; the ref reaches the element.
 *
 * It is a <div>. A row that opens a page waits for a link row in kit.css: an <a> would lay the browser's underline and
 * link colour over the lines that set no colour of their own. A row that selects is wrapped by the page's control.
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

type ListRowProps = Omit<ComponentPropsWithRef<"div">, "children"> & {
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

/** A row of a list: its face, its lines, and what trails its name. */
export function ListRow({ face, name, end, said, facts, note, className, ...div }: ListRowProps) {
  return (
    <div {...div} className={cx("list-row", className)}>
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
    </div>
  );
}
