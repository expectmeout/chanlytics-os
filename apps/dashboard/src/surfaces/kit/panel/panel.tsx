/**
 * The kit's panel (kit.css, "Panel"): a pane of content, an inset inside one, or what pops over the page; with the
 * pane's own padding (md), a small one (sm), or none, for rows edge to edge, which it clips (flush). It is drawn on the
 * element its content is: a <div> unless that is a section, an article or an aside, or a list or an item of one.
 * Where it stands, how wide it is and whether it may shrink in a grid are the page's, through `className`, which comes
 * last; a pop is placed by what opens it. The ref reaches the element.
 *
 * It draws what the gallery's Panel family draws, entry for entry (tooling/scripts/e2e-harness/kit-gallery.mjs;
 * tooling/scripts/tests/styles/kit-components.test.mjs holds the two together).
 */
import type { ComponentPropsWithRef } from "react";
import { cx, variants } from "../variants";

const panelClasses = variants({
  base: "panel",
  variants: {
    variant: { pane: "", inset: "panel-inset", pop: "panel-pop" },
    size: { md: "", sm: "panel-sm", flush: "panel-flush" },
  },
  defaults: { variant: "pane", size: "md" },
});

/** The elements a panel is drawn on. */
type PanelTag = "div" | "section" | "article" | "aside" | "ul" | "ol" | "li";

/**
 * A panel: its surface, its padding, and the element it is drawn on, with that element's attributes as any block
 * takes them; its ref holds the element as an HTMLElement, whichever it is.
 */
export type PanelProps = {
  variant?: "pane" | "inset" | "pop";
  size?: "md" | "sm" | "flush";
  as?: PanelTag;
} & ComponentPropsWithRef<"section">;

/** A panel, on the element `as` names. */
export function Panel({ as: tag = "div", variant, size, className, children, ...element }: PanelProps) {
  // Every tag here takes a block's attributes and an HTMLElement's ref, which is what PanelProps asks for; drawn with
  // the union itself, JSX would ask for the attributes and the ref of each tag at once.
  const Tag = tag as "section";
  return (
    <Tag {...element} className={cx(panelClasses({ variant, size }), className)}>
      {children}
    </Tag>
  );
}
