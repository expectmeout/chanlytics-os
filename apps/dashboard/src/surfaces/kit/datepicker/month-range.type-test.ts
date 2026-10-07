/**
 * What the kit's MonthRange takes, proved where the compiler reads it (month-range.tsx): the range's first day and its last,
 * today, the arrows' two glyphs, and the day the week begins on. A month with no today, an arrow short, a week that
 * begins on a Tuesday, a day that is not a string, and a choice (it chooses nothing) stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { MonthRangeProps } from "../index";
import { MonthRange } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _monthRangeTakes(glyph: ReactElement, root: RefObject<HTMLDivElement | null>): void {
  const glyphs = { previous: glyph, next: glyph };
  type _Its = [
    Holds<Exactly<ComponentProps<typeof MonthRange>, MonthRangeProps>>,
    Holds<Exactly<MonthRangeProps["from"], string>>,
    Holds<Exactly<MonthRangeProps["weekStartsOn"], 0 | 1 | undefined>>,
  ];
  MonthRange({ from: "2026-09-07", to: "2026-10-06", today: "2026-10-06", glyphs });
  MonthRange({
    from: "2026-09-07",
    to: "2026-10-06",
    today: "2026-10-06",
    glyphs,
    weekStartsOn: 0,
    ref: root,
    className: "rpt-when-month",
  });

  // @ts-expect-error the page says which day is today: the kit knows no zone
  MonthRange({ from: "2026-09-07", to: "2026-10-06", glyphs });
  // @ts-expect-error the arrows are two glyphs, the one before and the one after
  MonthRange({ from: "2026-09-07", to: "2026-10-06", today: "2026-10-06", glyphs: { next: glyph } });
  // @ts-expect-error a week begins on a Sunday or a Monday
  MonthRange({ from: "2026-09-07", to: "2026-10-06", today: "2026-10-06", glyphs, weekStartsOn: 2 });
  // @ts-expect-error a day is the page's own "YYYY-MM-DD", never a Date
  MonthRange({ from: new Date(), to: "2026-10-06", today: "2026-10-06", glyphs });
  // @ts-expect-error it chooses nothing: the range is the page's, picked elsewhere
  MonthRange({ from: "2026-09-07", to: "2026-10-06", today: "2026-10-06", glyphs, onValueChange: () => undefined });
}
