/**
 * The kit's panel (kit.css, "Panel"): a pane of content, an inset inside one, or what pops over the page; with the
 * pane's own padding (md), a small one (sm), or none, for rows edge to edge, which it clips (flush). It is drawn on a
 * <div>, or on a <section> where what it holds is one. Where it stands, how wide it is and whether it may shrink in a
 * grid are the page's, through `className`, which comes last; a pop is placed by what opens it. The ref reaches the
 * element.
 *
 * It draws what the gallery's Panel family draws, entry for entry (tooling/scripts/e2e-harness/kit-gallery.mjs;
 * tooling/scripts/tests/styles/kit-components.test.mjs holds the two together).
 */
import type { ComponentPropsWithRef } from "react";
import { cx, variants } from "./variants";

const panelClasses = variants({
  base: "panel",
  variants: {
    variant: { pane: "", inset: "panel-inset", pop: "panel-pop" },
    size: { md: "", sm: "panel-sm", flush: "panel-flush" },
  },
  defaults: { variant: "pane", size: "md" },
});

type PanelLook = { variant?: "pane" | "inset" | "pop"; size?: "md" | "sm" | "flush" };

/** The element it is drawn on, and so what its ref holds: a div, unless it is a section. */
type PanelElement =
  ({ as?: "div" } & ComponentPropsWithRef<"div">) | ({ as: "section" } & ComponentPropsWithRef<"section">);

type PanelProps = PanelLook & PanelElement;

/** A panel, on the element `as` names. */
export function Panel({ variant, size, className, children, ...element }: PanelProps) {
  const classes = cx(panelClasses({ variant, size }), className);
  if (element.as === "section") {
    const { as: _section, ...section } = element;
    return (
      <section {...section} className={classes}>
        {children}
      </section>
    );
  }
  const { as: _div, ...div } = element;
  return (
    <div {...div} className={classes}>
      {children}
    </div>
  );
}
