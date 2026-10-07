/**
 * What the kit's Tooltip takes, proved where the compiler reads it (tooltip.tsx): its words, the one control they
 * belong to, and the side of it they show on. A tip that is not words (no finger or screen reader reaches it, so it
 * can hold nothing to press), a tip for more than one control, and a side it does not show on stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { TooltipProps } from "../index";
import { Tooltip } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _tooltipTakes(control: ReactElement, glyph: ReactElement): void {
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Tooltip>, TooltipProps>>,
    Holds<Exactly<TooltipProps["tip"], string>>,
    Holds<Exactly<TooltipProps["side"], "top" | "bottom" | undefined>>,
  ];
  Tooltip({ tip: "Only an owner can export this workspace's people.", children: control });
  Tooltip({ tip: "Waiting on a decision from you", side: "bottom", children: control });

  // @ts-expect-error a tip is words: no finger or screen reader reaches it, so it holds nothing to press
  Tooltip({ tip: glyph, children: control });
  // @ts-expect-error a tip belongs to one control
  Tooltip({ tip: "Export", children: [control, control] });
  // @ts-expect-error it shows over or under its control
  Tooltip({ tip: "Export", side: "left", children: control });
}
