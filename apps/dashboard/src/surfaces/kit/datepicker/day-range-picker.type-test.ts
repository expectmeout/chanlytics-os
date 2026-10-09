/**
 * What the kit's DayRangePicker takes, proved where the compiler reads it (day-range-picker.tsx): the range chosen and
 * what it says as one is, today, the most days a range may hold, the grid's name, the words under it (and a day it
 * refused, and why), the arrows' two glyphs, and the day the week begins on. A month with no today, no limit, no name
 * or no words, a range said as one day, an arrow short, and a week that begins on a Tuesday stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { DayRange, DayRangeHint, DayRangePickerProps, PressRefusal } from "../index";
import { DayRangePicker } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _dayRangePickerTakes(glyph: ReactElement, root: RefObject<HTMLDivElement | null>): void {
  const glyphs = { previous: glyph, next: glyph };
  const range = { from: "2026-09-07", to: "2026-10-06", today: "2026-10-06" };
  const said = { most: 90, label: "Days", hint: (at: DayRangeHint) => (at.first ? "Pick the last day." : "") };
  const onRangeChange = (next: DayRange): void => void next;
  type _Its = [
    Holds<Exactly<ComponentProps<typeof DayRangePicker>, DayRangePickerProps>>,
    Holds<Exactly<DayRange, { from: string; to: string }>>,
    Holds<Exactly<DayRangeHint, { first: string | null; band: DayRange; refused: PressRefusal | null }>>,
    Holds<Exactly<PressRefusal, { day: string; why: "to-come" | "too-far" }>>,
    Holds<Exactly<DayRangePickerProps["weekStartsOn"], 0 | 1 | undefined>>,
    Holds<Exactly<Parameters<DayRangePickerProps["onRangeChange"]>, [range: DayRange]>>,
  ];
  DayRangePicker({ ...range, ...said, onRangeChange, glyphs });
  DayRangePicker({ ...range, ...said, onRangeChange, glyphs, weekStartsOn: 0, ref: root, className: "rpt-when-month" });

  // @ts-expect-error the page says which day is today: the kit knows no zone
  DayRangePicker({ from: range.from, to: range.to, ...said, onRangeChange, glyphs });
  // @ts-expect-error a range has a longest it may be, and the page says it
  DayRangePicker({ ...range, label: said.label, hint: said.hint, onRangeChange, glyphs });
  // @ts-expect-error the grid is named for a screen reader
  DayRangePicker({ ...range, most: said.most, hint: said.hint, onRangeChange, glyphs });
  // @ts-expect-error what is chosen so far is said under the grid, in the page's words
  DayRangePicker({ ...range, most: said.most, label: said.label, onRangeChange, glyphs });
  // @ts-expect-error it chooses a range, a first day and a last, never one day
  DayRangePicker({ ...range, ...said, onRangeChange: (day: string) => void day, glyphs });
  // @ts-expect-error the arrows are two glyphs, the one before and the one after
  DayRangePicker({ ...range, ...said, onRangeChange, glyphs: { next: glyph } });
  // @ts-expect-error a week begins on a Sunday or a Monday
  DayRangePicker({ ...range, ...said, onRangeChange, glyphs, weekStartsOn: 2 });
}
