/**
 * Conversations' rows drawn: the ones on screen and a few either side (kit/rows/shown-rows.ts), and the open row and its
 * neighbours wherever they are, so the arrows and J/K that walk them find each (pick.tsx pickKeys). Every row was built
 * on each press of the tab: 117 rows and 1,800 elements in a busy workspace (the strips review, 18 Oct 2026). The list's
 * element is the swap motion's too, so one ref gives it to both.
 */
import { useCallback, type RefObject } from "react";
import { useShownRows, type ShownRows } from "../../kit/rows/shown-rows";
import type { ConversationRow } from "../types";

/** A row's height before it is measured. */
const CV_ROW_PX = 76;

export function useShownCvRows(
  rows: readonly ConversationRow[],
  openId: string | undefined,
  swap: RefObject<HTMLDivElement | null>,
): { shown: ShownRows; ref: (el: HTMLDivElement | null) => void } {
  const open = openId ? rows.findIndex((c) => c.id === openId) : -1;
  const shown = useShownRows({
    count: rows.length,
    estimate: CV_ROW_PX,
    keyOf: (i) => rows[i]?.id ?? String(i),
    keep: open >= 0 ? [open - 1, open, open + 1] : [0],
  });
  const { listRef } = shown;
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      swap.current = el;
      listRef(el);
    },
    [swap, listRef],
  );
  return { shown, ref };
}
