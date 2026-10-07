/**
 * The kit's tooltip (kit.css, "Tooltip surface"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4 and
 * step 2.5): the app's one tooltip (.ui-tip), a few words beside a control of the page's that say more of what it
 * is, over it or under it (`side`).
 *
 * Its behaviour is Base UI's Tooltip (`@base-ui/react/tooltip`, the plan's decision 15): it shows as the pointer
 * rests on its control and as the keyboard brings focus to it, after the house's pause, and hides as they leave, on
 * Escape and on a press. It is for a pointer and a keyboard alone: Base UI shows none to a finger, and a screen
 * reader is not told it, so the control says the same in its own name or description (a glyph alone says its name,
 * a refused control its reason). It is drawn in a portal on the document's body, over everything, as the house's
 * is. Its coming and going is the kit's `.show` (kit.css), which Base UI's open state sets. The kit writes none of it.
 *
 * It draws what the gallery's Tooltip family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser.
 */
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";
import { cx } from "../variants";

/** How long the pointer rests on a control before its tip shows, and how long it stays after, as the house's. */
const SHOW_AFTER_MS = 280;
const HIDE_AFTER_MS = 80;
/** The room between a control and its tip. */
const TIP_GAP_PX = 8;

/** A tooltip: the words, the control they belong to, and the side of it they show on. */
export type TooltipProps = {
  tip: string;
  /** The control: the page's own element, which the tooltip is drawn around and which names itself. */
  children: ReactElement;
  side?: "top" | "bottom";
};

/** Shown, in the kit's word for it (kit.css, .ui-tip.show): open, and not on its way in or out. */
const shown = (state: { open: boolean; transitionStatus: "starting" | "ending" | "idle" | undefined }) =>
  state.open && state.transitionStatus !== "starting" && state.transitionStatus !== "ending";

/** A control with its tip, the tip drawn on the document's body. */
export function Tooltip({ tip, children, side = "top" }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} delay={SHOW_AFTER_MS} closeDelay={HIDE_AFTER_MS} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner className="tip-place" side={side} sideOffset={TIP_GAP_PX}>
          <BaseTooltip.Popup className={(state) => cx("ui-tip", shown(state) && "show")}>{tip}</BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
