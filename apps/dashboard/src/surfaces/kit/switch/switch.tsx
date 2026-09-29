/**
 * The kit's switch (kit.css, "A switch"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4 and step
 * 2.5): on or off, the record kit's (.rec-switch and its knob), a real button that says which it is. Its name is the
 * page's: `label`, or `labelledBy` pointing at the words beside it that already say it; `describedBy` points at the
 * sentence that says what it does, where a page has one.
 *
 * Its behaviour is Base UI's Switch (`@base-ui/react/switch`, the plan's decision 15): a press, Space or Enter asks
 * the page for the other state (`onCheckedChange`), which the page gives by setting `checked`; a hidden checkbox
 * beside it carries the state into a form. `readOnly`, while a save is out, keeps it and its focus where they are
 * and says so to a screen reader (never `disabled`, which lets focus go). The kit writes none of it.
 *
 * It draws what the gallery's Switch family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser. `className` is for the page's layout, and comes last; the
 * ref reaches the button.
 */
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { Ref } from "react";
import { cx } from "../variants";

/** What names a switch: its own words, or the words beside it. */
type SwitchName = { label: string; labelledBy?: undefined } | { labelledBy: string; label?: undefined };

/** A switch: whether it is on, what it asks as it is pressed, its name, and what describes it. */
export type SwitchProps = SwitchName & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  describedBy?: string;
  readOnly?: boolean;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
};

/** A switch, on or off. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  labelledBy,
  describedBy,
  readOnly,
  className,
  ref,
}: SwitchProps) {
  return (
    <BaseSwitch.Root
      ref={ref}
      checked={checked}
      onCheckedChange={(next: boolean) => onCheckedChange(next)}
      readOnly={readOnly}
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={cx("rec-switch", className)}
      nativeButton
      render={<button type="button" />}
    >
      <BaseSwitch.Thumb className="rec-knob" aria-hidden="true" />
    </BaseSwitch.Root>
  );
}
