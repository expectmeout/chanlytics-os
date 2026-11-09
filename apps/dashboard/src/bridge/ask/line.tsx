/**
 * Ask's Line as the frame draws it (surfaces/frame/shell-chrome.tsx's `AskBar`, the one Line every page shares). Its pages and the parts
 * only they draw are a chunk of their own (surfaces/ask/line/line.tsx), fetched once the frame is idle, or at once when the Line is
 * opened before that (⌘K, the top bar's Ask, a door that asks). In the frame they were about 70 KB, compressed, that every
 * first load parsed before any page could draw (the loadability review, 19 Oct 2026). The Line is drawn inside this
 * component once its code is in, so the chunk landing never swaps the component the shell draws, and the Line keeps
 * what it holds from then on. What Ask answers through (window.__ask: bridge/ask.ts) stays in the frame: the
 * top bar, Today and the arrival read it as the page loads. The specs its cards read (the gate, the undo, the Open:
 * contracts' page-specs entry, verbs/commit.ts pageSpecs) come with it, so a card drawn has them.
 */
import { useEffect, useState, type ComponentType } from "react";
import { codeOnce } from "../../lib/code-once";
import { pageSpecs } from "../verbs/commit";
import { aheadWhenIdle } from "../workspace";

interface LineProps {
  open: boolean;
  onClose: () => void;
}

/** The Line itself (surfaces/ask/line/line.tsx), once its chunk is in. */
let lineCode: ComponentType<LineProps> | null = null;

/**
 * The Line's chunk and its cards' specs (the undo and the Open its cards read through verbs/commit.ts pageSpecs): fetched
 * once and shared; a fetch that failed is asked for again by the next press.
 */
export const askLineCode = codeOnce(() =>
  Promise.all([import("@/surfaces/ask/line/line"), pageSpecs()]).then(([code]) => {
    lineCode = code.AskReal;
  }),
);

/** How long an idle frame may wait before the Line's code is fetched: sooner than the rest, since ⌘K comes early. */
const LINE_IDLE_MS = 2000;

const lineNow = (): ComponentType<LineProps> | null => lineCode;

export function AskLine(props: LineProps) {
  const [Line, setLine] = useState(lineNow);
  const { open } = props;
  useEffect(() => {
    if (Line) return undefined;
    let live = true;
    const load = () =>
      void askLineCode().then(
        () => {
          if (live) setLine(lineNow);
        },
        () => {},
      );
    if (open) {
      load();
      return () => {
        live = false;
      };
    }
    const cancel = aheadWhenIdle(load, LINE_IDLE_MS);
    return () => {
      live = false;
      cancel();
    };
  }, [Line, open]);
  return Line ? <Line {...props} /> : null;
}
