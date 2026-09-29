/**
 * The kit's quiet link button (kit.css, "The quiet link button"): words that act, with no ground, as Confirm's No and a
 * line's acts draw them, and its danger form, red at rest. Not a Button's variant: it has no height, padding, border or
 * ground of a button's. Words that open a page are a link with the same classes (./press.tsx, "a door is a link"),
 * which keeps the browser's underline in the words' own colour, as the house's quiet links draw one today
 * (`<a class="cl-bucket-link">`); the gallery holds the two equal.
 *
 * It draws what the gallery's Link button family draws, entry for entry (tooling/scripts/e2e-harness/kit-gallery.mjs;
 * tooling/scripts/tests/styles/kit-components.test.mjs holds the two together). `className` is for the page's layout,
 * and comes last; the ref reaches the element.
 */
import type { PressAct, PressDoor } from "./press";
import { Press } from "./press";
import { cx, variants } from "./variants";

const linkButtonClasses = variants({ base: "link-btn", variants: { tone: { danger: "link-btn-danger" } } });

/** Quiet words: their one tone, and an act or a door (./press.tsx). */
export type LinkButtonProps = { tone?: "danger" } & (PressAct | PressDoor);

/** Quiet words that act, or open a page where they have an address. */
export function LinkButton({ tone, className, children, ...element }: LinkButtonProps) {
  return (
    <Press {...element} className={cx(linkButtonClasses({ tone }), className)}>
      {children}
    </Press>
  );
}
