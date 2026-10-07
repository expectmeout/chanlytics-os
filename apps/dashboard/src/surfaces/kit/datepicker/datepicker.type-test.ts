/**
 * What the kit's DatePicker takes, proved where the compiler reads it (datepicker.tsx): the day chosen and what it
 * says as another is, today, the page's control that opens it, its name, the arrows' two glyphs, and the day the week
 * begins on. A picker with no name, no today or one glyph, a week that begins on a Tuesday, and a day that is not a
 * string stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { DatePickerProps } from "../index";
import { DatePicker } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _datePickerTakes(trigger: ReactElement, glyph: ReactElement, popup: RefObject<HTMLDivElement | null>): void {
  const choose = (_day: string) => undefined;
  const glyphs = { previous: glyph, next: glyph };
  type _Its = [
    Holds<Exactly<ComponentProps<typeof DatePicker>, DatePickerProps>>,
    Holds<Exactly<DatePickerProps["onValueChange"], (day: string) => void>>,
    Holds<Exactly<DatePickerProps["weekStartsOn"], 0 | 1 | undefined>>,
  ];
  DatePicker({
    value: "2026-10-02",
    onValueChange: choose,
    today: "2026-10-02",
    trigger,
    label: "Go to a date",
    glyphs,
  });
  DatePicker({
    value: "2026-10-02",
    onValueChange: choose,
    today: "2026-10-02",
    trigger,
    label: "Go to a date",
    glyphs,
    weekStartsOn: 0,
    ref: popup,
    className: "cal-pick",
  });

  // @ts-expect-error a date picker is a dialog, and names itself to a screen reader
  DatePicker({ value: "2026-10-02", onValueChange: choose, today: "2026-10-02", trigger, glyphs });
  // @ts-expect-error the page says which day is today: the kit knows no zone
  DatePicker({ value: "2026-10-02", onValueChange: choose, trigger, label: "Go to a date", glyphs });
  DatePicker({
    value: "2026-10-02",
    onValueChange: choose,
    today: "2026-10-02",
    trigger,
    label: "Go to a date",
    // @ts-expect-error the arrows are two glyphs, the one before and the one after
    glyphs: { next: glyph },
  });
  DatePicker({
    value: "2026-10-02",
    onValueChange: choose,
    today: "2026-10-02",
    trigger,
    label: "Go to a date",
    glyphs,
    // @ts-expect-error a week begins on a Sunday or a Monday
    weekStartsOn: 2,
  });
  // @ts-expect-error a day is the page's own "YYYY-MM-DD", never a Date
  DatePicker({ value: new Date(), onValueChange: choose, today: "2026-10-02", trigger, label: "Go to a date", glyphs });
}
