/**
 * The kit's segmented control (kit.css, "A choice of a few"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md,
 * §3.4 and step 2.5): one of a few, side by side on one track, the chosen one raised: the record kit's (.rec-seg). An
 * option may carry a sentence of what choosing it means (`hint`), and then each option is a card of its words and
 * that sentence, named by the one and described by the other.
 *
 * It is a radio group, as the record kit's is, and its behaviour is Base UI's RadioGroup and Radio
 * (`@base-ui/react/radio-group`, `@base-ui/react/radio`; the plan's decision 15): one tab stop, on the chosen option;
 * the arrows choose the next or the one before and take focus there, wrapping at either end; a press or Space
 * chooses; a hidden radio beside each carries the choice into a form. `readOnly`, while a save is out, keeps the
 * choice and says so (never `disabled`). The kit writes none of it.
 *
 * A surface's views that change the address are links, never this (the shell's "a door is a link"): this changes
 * what a page shows or keeps, in place.
 *
 * It draws what the gallery's Segmented family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser. `className` is for the page's layout, and comes last; the
 * ref reaches the group.
 */
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import type { Ref } from "react";
import { useId } from "react";
import { cx } from "../variants";

/** An option: the value the page keeps, its words, and the sentence of what choosing it means, or none. */
export type SegmentedOption<V extends string> = { value: V; label: string; hint?: string };

/** What names the group: its own words, or the words on the page that already say it. */
type SegmentedName = { label: string; labelledBy?: undefined } | { labelledBy: string; label?: undefined };

/** A segmented control: the one chosen, the options, what it says as one is chosen, and its name. */
export type SegmentedProps<V extends string> = SegmentedName & {
  value: V;
  onValueChange: (value: V) => void;
  options: readonly SegmentedOption<V>[];
  readOnly?: boolean;
  className?: string;
  ref?: Ref<HTMLDivElement>;
};

/** The ids of an option's words and sentence, where it has a sentence. */
const wordsOf = (id: string, at: number) => ({ label: `${id}-${at}-label`, hint: `${id}-${at}-hint` });

/** One of a few, chosen on a track. */
export function Segmented<V extends string>(props: SegmentedProps<V>) {
  const { value, onValueChange, options, label, labelledBy, readOnly, className, ref } = props;
  const id = useId();
  const hints = options.some((option) => option.hint !== undefined);
  return (
    <RadioGroup
      ref={ref}
      value={value}
      onValueChange={(next: V) => onValueChange(next)}
      readOnly={readOnly}
      aria-label={label}
      aria-labelledby={labelledBy}
      className={cx("rec-seg", className)}
      data-hints={hints ? "true" : undefined}
    >
      {options.map((option, at) => {
        const words = option.hint === undefined ? null : wordsOf(id, at);
        return (
          <Radio.Root
            key={option.value}
            value={option.value}
            className="rec-seg-btn"
            nativeButton
            render={<button type="button" />}
            aria-labelledby={words?.label}
            aria-describedby={words?.hint}
          >
            {words ? (
              <>
                <span className="rec-seg-label" id={words.label}>
                  {option.label}
                </span>
                <span className="rec-seg-hint" id={words.hint}>
                  {option.hint}
                </span>
              </>
            ) : (
              option.label
            )}
          </Radio.Root>
        );
      })}
    </RadioGroup>
  );
}
