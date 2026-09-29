/**
 * The kit's button (kit.css, "Buttons"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4): what a
 * surface draws where the lint refuses a raw <button> (eslint.config.mjs, KIT_TAKES). Four kinds: secondary, the
 * default; primary; quiet, the ghost; and danger, the filled act that destroys or cannot be undone. Two sizes, and a
 * glyph alone. A button that opens a page is a link with the same classes, its address in the href, so a long press, a
 * middle click or a new tab opens it too (the shell's "a door is a link", data-bits `routeDoor`).
 *
 * It draws what the gallery's Button family draws, entry for entry (tooling/scripts/e2e-harness/kit-gallery.mjs), and
 * tooling/scripts/tests/styles/kit-components.test.mjs holds the two together, so a legacy page that writes the
 * classes by hand and a surface that draws this draw the same thing. `className` is for the page's layout, and comes
 * last; the ref reaches the element.
 */
import type { ComponentPropsWithRef } from "react";
import { cx, variants } from "./variants";

/** Its classes, in the order the gallery writes them: a glyph alone, the size, the kind, the words' tone. */
const buttonClasses = variants({
  base: "btn",
  variants: {
    shape: { words: "", glyph: "btn-icon" },
    size: { md: "", sm: "btn-sm" },
    variant: { secondary: "", primary: "btn-primary", quiet: "btn-ghost", danger: "btn-danger" },
    tone: { danger: "danger" },
  },
  defaults: { shape: "words", size: "md", variant: "secondary" },
});

/**
 * Its kind, and the tone of its words. Red words are the control that arms a question (Delete…, Stop), on a button
 * with no ground of its own colour; a filled button keeps its ink, and the act that destroys is the danger kind.
 */
type ButtonLook =
  { variant?: "secondary" | "quiet"; tone?: "danger" } | { variant: "primary" | "danger"; tone?: undefined };

/** What it holds: words, with a glyph beside them or not; or a glyph alone, which then says its name. */
type ButtonHolds = { iconOnly?: false } | { iconOnly: true; "aria-label": string };

/** A button that acts where it stands: a <button>, which submits a form only when `type` asks it to. */
type ButtonAct = ComponentPropsWithRef<"button"> & { href?: undefined };

/** A button that opens a page of its own: a link, which is never disabled, since a door that goes nowhere is none. */
type ButtonDoor = ComponentPropsWithRef<"a"> & { href: string };

type ButtonProps = ButtonLook & ButtonHolds & { size?: "sm" | "md" } & (ButtonAct | ButtonDoor);

/** A button, or a link drawn as one where it has an address. */
export function Button({ variant, tone, iconOnly = false, size, className, children, ...element }: ButtonProps) {
  const classes = cx(buttonClasses({ shape: iconOnly ? "glyph" : "words", size, variant, tone }), className);
  if (element.href !== undefined) {
    return (
      <a {...element} className={classes}>
        {children}
      </a>
    );
  }
  const { type = "button", href: _none, ...act } = element;
  return (
    <button {...act} type={type} className={classes}>
      {children}
    </button>
  );
}
