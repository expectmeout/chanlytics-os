/**
 * Campaigns › Content's tiles, in columns (model/tiles.ts): as many as the page's width holds, the pieces dealt to
 * the shortest, so each stands at its own shape and no column runs long. Drawn before the width is known as two, a phone's:
 * the page a server or a test draws is the narrow one. The count is said on the box (`data-count`), so the stylesheet lays
 * them out with no style of the page's own.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { contentColumnsOf, type TileShape } from "./model/tiles";

/** The narrowest a column stands, and the most the page draws. */
const COLUMN_MIN_PX = 168;
const COLUMNS_AT_MOST = 6;

const countFor = (width: number): number => Math.max(2, Math.min(COLUMNS_AT_MOST, Math.floor(width / COLUMN_MIN_PX)));

export function ContentColumns<T>({
  pieces,
  shapeOf,
  keyOf,
  draw,
  testid,
}: {
  pieces: readonly T[];
  shapeOf: (piece: T) => TileShape;
  keyOf: (piece: T) => string;
  draw: (piece: T) => ReactNode;
  testid?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(2);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver !== "function") return undefined;
    const seen = new ResizeObserver(() => setCount(countFor(el.clientWidth)));
    seen.observe(el);
    setCount(countFor(el.clientWidth));
    return () => seen.disconnect();
  }, []);
  return (
    <div ref={box} className="cnv-cols" data-count={count} data-testid={testid}>
      {contentColumnsOf(pieces, count, shapeOf).map((column, i) => (
        // A column is its place, never what it holds: its pieces move between columns as the count changes.
        <div key={i} className="cnv-col" data-testid="cnv-col">
          {column.map((piece) => (
            <div key={keyOf(piece)} className="cnv-slot">
              {draw(piece)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
