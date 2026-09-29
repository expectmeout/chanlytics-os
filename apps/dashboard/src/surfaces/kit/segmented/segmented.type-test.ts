/**
 * What the kit's Segmented takes, proved where the compiler reads it (segmented.tsx): its name, the one chosen, the
 * options with a sentence under each or none, and what it says as one is chosen. The one chosen and what it says are
 * of the options' own values, so a value they do not hold, a group with no name or two, and one that is disabled
 * (never: it lets focus go) stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { SegmentedOption, SegmentedProps } from "../index";
import { Segmented } from "../index";

type Often = "once" | "week";

/** Never called: the compiler reads it, and nothing runs it. */
function _segmentedTakes(
  group: RefObject<HTMLDivElement | null>,
  options: readonly SegmentedOption<Often>[],
  now: { often: Often; saving: boolean },
): void {
  const choose = (_often: Often) => undefined;
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Segmented>, SegmentedProps<string>>>,
    Holds<Exactly<SegmentedOption<Often>, { value: Often; label: string; hint?: string }>>,
    Holds<Exactly<SegmentedProps<Often>["onValueChange"], (value: Often) => void>>,
  ];
  Segmented({ label: "How often", value: now.often, onValueChange: choose, options });
  Segmented({
    labelledBy: "pb-often-label",
    value: now.often,
    onValueChange: choose,
    options: [
      { value: "once", label: "Once", hint: "On the day it is set for." },
      { value: "week", label: "Every week" },
    ],
    readOnly: now.saving,
    ref: group,
    className: "pb-often",
  });

  // @ts-expect-error the one chosen is one of the options
  Segmented<Often>({ label: "How often", value: "month", onValueChange: choose, options });
  // @ts-expect-error a group is named: by its own words, or by the words on the page that say it
  Segmented({ value: now.often, onValueChange: choose, options });
  // @ts-expect-error one name, not two
  Segmented({ label: "How often", labelledBy: "pb-often-label", value: now.often, onValueChange: choose, options });
  // @ts-expect-error never disabled, which lets focus go to the page: it is read-only while a save is out
  Segmented({ label: "How often", value: now.often, onValueChange: choose, options, disabled: true });
}
