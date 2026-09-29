/**
 * The kit's combobox (kit.css, "A combobox"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4 and step
 * 2.5): a box over a list that narrows as you type, the record kit's, with its glass (the Icon's `search`, which the
 * page hands it). Closed, the box says the one chosen, and focus or a press that opens the list selects its words, so
 * the first key replaces them; typing opens the list on its matches, the first of them walked to, and words nothing
 * matches draw no list, as the record kit's draws none. The list pops over the page on the kit's Panel in its pop, at
 * least as wide as the box, where the record kit's pushed the rows under it.
 *
 * Its behaviour is Base UI's Combobox (`@base-ui/react/combobox`, the plan's decision 15): focus stays in the box
 * while the arrows walk the list (aria-activedescendant); Enter or a press chooses; Escape closes the list and says it
 * handled the key, so a sheet around it stays open. The list is drawn in a portal on the document's body. The kit
 * writes none of that. It draws an empty list, which Base UI marks (its `empty`), by the record kit's own state for
 * it, `hidden`; and it selects the words chosen as the record kit's box does, which Base UI does not.
 *
 * It draws what the gallery's Combobox family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser. `className` is for the page's layout, and comes last; the
 * ref reaches the box's input.
 */
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import type { ReactElement, Ref } from "react";
import { useMemo, useRef } from "react";
import { Panel } from "../panel/panel";
import type { SelectOption } from "../select/select";
import { cx } from "../variants";

/** The room between the box and its list. */
const LIST_GAP_PX = 4;

/** A combobox: the one chosen or none, the options, what it says as one is chosen, its name and its glass. */
export type ComboboxProps<V extends string> = {
  /** Its name to a screen reader: the box's, and the list's. */
  label: string;
  value: V | null;
  onValueChange: (value: V) => void;
  options: readonly SelectOption<V>[];
  /** What the empty box says. */
  placeholder?: string;
  /** The box's glass: the Icon's `search`, at 12px. */
  glass: ReactElement;
  /** While a save is out: it keeps its focus and opens no list (never `disabled`, which lets focus go). */
  readOnly?: boolean;
  className?: string;
  ref?: Ref<HTMLInputElement>;
};

/** The one chosen, in the record kit's word for it (kit.css, .rec-combo-opt[data-chosen]). */
const chosen = (state: { selected: boolean }) => (state.selected ? "true" : undefined);

/** A combobox: a box that narrows a list as you type, the list drawn on the document's body. */
export function Combobox<V extends string>(props: ComboboxProps<V>) {
  const { label, value, onValueChange, options, placeholder, glass, readOnly, className, ref } = props;
  // Whether a press on the box opens its list: then it selects the words, as focus does, where the press would put
  // the caret where it landed and a search would start in the middle of the words chosen.
  const pressOpens = useRef(false);
  // The options by their value, with their words: what the box says, and what typing matches.
  const items = useMemo(
    () => BaseCombobox.createItems(options, { getValue: (option) => option.value, getLabel: (option) => option.label }),
    [options],
  );
  return (
    <BaseCombobox.Root
      items={items}
      value={value}
      onValueChange={(next: V | null) => {
        if (next !== null) onValueChange(next);
      }}
      autoHighlight
      readOnly={readOnly}
    >
      <BaseCombobox.InputGroup className={cx("rec-combo", className)}>
        <span className="rec-combo-field">
          <span className="rec-combo-glass" aria-hidden="true">
            {glass}
          </span>
          <BaseCombobox.Input
            ref={ref}
            className="rec-combo-input"
            aria-label={label}
            placeholder={placeholder}
            onMouseDown={(event) => {
              pressOpens.current = event.currentTarget.getAttribute("aria-expanded") !== "true";
            }}
            onFocus={(event) => event.currentTarget.select()}
            onMouseUp={(event) => {
              if (!pressOpens.current) return;
              pressOpens.current = false;
              event.preventDefault();
              event.currentTarget.select();
            }}
          />
        </span>
      </BaseCombobox.InputGroup>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner className="pop-place" sideOffset={LIST_GAP_PX}>
          <BaseCombobox.Popup
            className="rec-combo-pop"
            render={(popup, state) => <Panel {...popup} variant="pop" size="flush" hidden={state.empty} />}
          >
            <BaseCombobox.List className="rec-combo-list" aria-label={label}>
              {(option: SelectOption<V>) => (
                <BaseCombobox.Item
                  key={option.value}
                  value={option.value}
                  className="rec-combo-opt"
                  render={(itemProps, state) => <div {...itemProps} data-chosen={chosen(state)} />}
                >
                  <span className="rec-combo-label">{option.label}</span>
                  {option.meta ? <span className="rec-combo-meta">{option.meta}</span> : null}
                </BaseCombobox.Item>
              )}
            </BaseCombobox.List>
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}
