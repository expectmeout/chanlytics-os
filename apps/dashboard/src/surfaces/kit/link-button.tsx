/**
 * The kit's quiet link button (kit.css, "The quiet link button"): words that act, with no ground, as Confirm's No and a
 * line's acts draw them, and its danger form, red at rest. Not a Button's variant: it has no height, padding, border or
 * ground of a button's. It acts where it stands. Words that open a page wait for a link's look, in kit.css with its
 * gallery entry: an <a> keeps the browser's underline, of which `.link-btn` says nothing.
 *
 * It draws what the gallery's Link button family draws, entry for entry (tooling/scripts/e2e-harness/kit-gallery.mjs;
 * tooling/scripts/tests/styles/kit-components.test.mjs holds the two together). `className` is for the page's layout,
 * and comes last; the ref reaches the element.
 */
import type { ComponentPropsWithRef } from "react";
import { cx, variants } from "./variants";

const linkButtonClasses = variants({ base: "link-btn", variants: { tone: { danger: "link-btn-danger" } } });

type LinkButtonProps = { tone?: "danger" } & ComponentPropsWithRef<"button">;

/** Quiet words that act, submitting a form only when `type` asks them to. */
export function LinkButton({ tone, className, children, type = "button", ...button }: LinkButtonProps) {
  return (
    <button {...button} type={type} className={cx(linkButtonClasses({ tone }), className)}>
      {children}
    </button>
  );
}
