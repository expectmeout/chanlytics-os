/**
 * The handle at a sheet's top: a mark of the pull, or, where what it heads has two rests, a button that turns it to the
 * other, said by where it goes. A sheet with two rests draws it (sheet.tsx `rest`), and so does a foot docked at the
 * screen's foot with two rests, folded and open (an open thread's reply box on a phone, dock.ts dockSwipe), which takes
 * this module alone and none of the sheet's own.
 */
import type { SheetRest } from "./rests";

/** Where what the handle heads stands, what moves it, and the handle's name for each way it goes. */
export interface SheetRestControl {
  at: SheetRest;
  onRest: (at: SheetRest) => void;
  turn: { up: string; down: string };
}

export function SheetHandle({ rest, testid }: { rest?: SheetRestControl | null; testid?: string }) {
  if (!rest) return <div className="sheet-handle" aria-hidden="true" />;
  const to: SheetRest = rest.at === "half" ? "full" : "half";
  return (
    <button
      type="button"
      className="sheet-handle"
      aria-label={to === "full" ? rest.turn.up : rest.turn.down}
      aria-expanded={rest.at === "full"}
      onClick={() => rest.onRest(to)}
      data-testid={testid ? `${testid}-handle` : undefined}
    />
  );
}
