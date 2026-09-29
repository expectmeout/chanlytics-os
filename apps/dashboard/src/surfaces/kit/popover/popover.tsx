/**
 * The kit's popover (docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4 and step 2.5): what pops over
 * the page from a control of the page's, holding the page's words and acts (hours to read, a note with a link), on
 * the kit's Panel in its pop surface (kit.css, "Panel"), with its padding (`size`).
 *
 * Its behaviour is Base UI's Popover (`@base-ui/react/popover`, the plan's decision 15): its control opens and closes
 * it; Escape and a press outside close it, and focus goes back to its control; it is a dialog, named by `label`,
 * that the page behind stays open beside (it is not modal). It hangs from its control on the side `side` names and
 * turns over where there is no room, placed by Base UI against the window in a portal on the document's body. The
 * kit writes none of it.
 *
 * It draws what the gallery's Panel family draws for a pop (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser. `className` is for the page's layout (its width), and comes
 * last; the ref reaches the popover.
 */
import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactElement, ReactNode, Ref } from "react";
import { Panel } from "../panel/panel";

/** The room between the control and the popover. */
const POP_GAP_PX = 8;

/** A popover: what opens it, its name, what it holds, its padding, and the side and edge it hangs from. */
export type PopoverProps = {
  /** The page's control that opens it: the kit's Button, which it is drawn as. */
  trigger: ReactElement;
  /** Its name to a screen reader. */
  label: string;
  children: ReactNode;
  size?: "md" | "sm" | "flush";
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  className?: string;
  ref?: Ref<HTMLDivElement>;
};

/** A popover, opened by the page's control and drawn on the document's body. */
export function Popover({
  trigger,
  label,
  children,
  size = "sm",
  side = "bottom",
  align = "center",
  className,
  ref,
}: PopoverProps) {
  return (
    <BasePopover.Root>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner className="pop-place" side={side} align={align} sideOffset={POP_GAP_PX}>
          <BasePopover.Popup
            ref={ref}
            aria-label={label}
            className={className}
            render={<Panel variant="pop" size={size} />}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
