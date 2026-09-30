/**
 * What the kit's Popover takes, proved where the compiler reads it (popover.tsx): the page's control that opens it,
 * its name, what it holds, the panel's padding it takes, and the side and edge of its control it hangs from. A popover
 * with no name, a padding or a surface the panel's pop does not have, and a side it does not hang from stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { PopoverProps } from "../index";
import { Popover } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _popoverTakes(trigger: ReactElement, div: RefObject<HTMLDivElement | null>): void {
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Popover>, PopoverProps>>,
    Holds<Exactly<PopoverProps["size"], "md" | "sm" | "flush" | undefined>>,
    Holds<Exactly<PopoverProps["side"], "top" | "bottom" | undefined>>,
    Holds<Exactly<PopoverProps["align"], "start" | "center" | "end" | undefined>>,
  ];
  Popover({ trigger, label: "Hours", children: "Open today until six." });
  Popover({
    trigger,
    label: "Hours",
    size: "flush",
    side: "top",
    align: "start",
    ref: div,
    className: "pl-hours",
    children: "Three services",
  });

  // @ts-expect-error a popover is a dialog, and names itself to a screen reader
  Popover({ trigger, children: "Open today until six." });
  // @ts-expect-error its paddings are the panel's: md, sm and flush
  Popover({ trigger, label: "Hours", size: "lg", children: "Open today until six." });
  // @ts-expect-error it hangs over or under its control
  Popover({ trigger, label: "Hours", side: "left", children: "Open today until six." });
  // @ts-expect-error it is the panel's pop, and takes no other surface
  Popover({ trigger, label: "Hours", variant: "inset", children: "Open today until six." });
}
