/**
 * The kit's select (kit.css, "A combobox" and "A field"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md,
 * §3.4 and step 2.5): one of a list, chosen from a box that says the one chosen, with a chevron (the Icon's
 * `chevron-down`, which the page hands it). The box is the record kit's (.rec-input); the list pops over the page on
 * the kit's Panel in its pop, the record kit's list and options inside it, at least as wide as the box.
 *
 * Its behaviour is Base UI's Select (`@base-ui/react/select`, the plan's decision 15): the box opens the list with a
 * press, Enter, Space or an arrow, and the arrows, Home, End and a typed word walk it; Enter or a press chooses;
 * Escape and a press outside close it and give focus back to the box, and the page holds still while it is open. It
 * is named by `label`, or by the kit's Field it stands in, which also wires its hint and what is wrong with it. The
 * list is drawn in a portal on the document's body. The kit writes none of it.
 *
 * It draws what the gallery's Select family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser. `className` is for the page's layout, and comes last; the
 * ref reaches the box.
 */
import { Select as BaseSelect } from "@base-ui/react/select";
import type { ReactElement, Ref } from "react";
import { Panel } from "../panel/panel";
import { cx } from "../variants";

/** The room between the box and its list. */
const LIST_GAP_PX = 4;

/** An option: the value the page keeps, the words shown, and a word at its end (a code, a count) or none. */
export type SelectOption<V extends string> = { value: V; label: string; meta?: string };

/** A select: the one chosen, the options, what it says as one is chosen, its chevron, and its name. */
export type SelectProps<V extends string> = {
  value: V;
  onValueChange: (value: V) => void;
  options: readonly SelectOption<V>[];
  /** The box's chevron: the Icon's `chevron-down`, at 12px. */
  chevron: ReactElement;
  /** Its name to a screen reader, where no Field's label names it. */
  label?: string;
  /** While a save is out: it keeps its focus and opens on nothing new (never `disabled`, which lets focus go). */
  readOnly?: boolean;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
};

/** The one chosen, in the record kit's word for it (kit.css, .rec-combo-opt[data-chosen]). */
const chosen = (state: { selected: boolean }) => (state.selected ? "true" : undefined);

/** A select: a box that says the one chosen, over a list drawn on the document's body. */
export function Select<V extends string>({
  value,
  onValueChange,
  options,
  chevron,
  label,
  readOnly,
  className,
  ref,
}: SelectProps<V>) {
  return (
    <BaseSelect.Root
      value={value}
      onValueChange={(next: V | null) => {
        if (next !== null) onValueChange(next);
      }}
      items={options}
      readOnly={readOnly}
    >
      <BaseSelect.Trigger ref={ref} className={cx("rec-input rec-select", className)} aria-label={label}>
        <BaseSelect.Value />
        <BaseSelect.Icon>{chevron}</BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="pop-place" alignItemWithTrigger={false} sideOffset={LIST_GAP_PX}>
          <BaseSelect.Popup className="rec-combo-pop" render={<Panel variant="pop" size="flush" />}>
            <BaseSelect.List className="rec-combo-list">
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  className="rec-combo-opt"
                  render={(props, state) => <div {...props} data-chosen={chosen(state)} />}
                >
                  <BaseSelect.ItemText className="rec-combo-label" render={<span />}>
                    {option.label}
                  </BaseSelect.ItemText>
                  {option.meta ? <span className="rec-combo-meta">{option.meta}</span> : null}
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
