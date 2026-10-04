/**
 * The kit's picker (kit.css, "Token" and "A combobox"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4
 * and line 694, which gives a picker's groups, glyphs, lines and note to the Campaigns step): a choice inside a sentence.
 * Closed, it is a word of the sentence it stands in -- a token, the one chosen with its chevron ("Every day at [10:00]",
 * "To [Everyone who said yes]") -- and pressed it opens the options over the page on the panel's pop: in groups under
 * their headings, each with a glyph before it, a line under it or a word at its end, and one line under them all saying
 * why something is not offered. A long list takes a search at its top, which narrows it as you type.
 *
 * Its behaviour is Base UI's (the plan's decision 15): a list to search is the Combobox with its input inside the popup
 * (`@base-ui/react/combobox`), a short one the Select (`@base-ui/react/select`). Either way the token opens the list with
 * a press, Enter, Space or an arrow; the arrows, Home, End and a typed word walk it; Enter or a press chooses; Escape and a
 * press outside close it and give focus back to the token, and the page holds still while it is open. The list is drawn in
 * a portal on the document's body. The kit writes none of it. It replaced the 770 lines of Campaigns' own picker
 * (CmPicker: its placement, its click-outside, its keys and its phone sheet) and the native selects in the composer's
 * sentences.
 *
 * It draws what the gallery's Picker family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser. `className` is for the page's layout, and comes last; the ref
 * reaches the token.
 */
import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { Select as BaseSelect } from "@base-ui/react/select";
import type { ReactElement, ReactNode, Ref } from "react";
import { useMemo } from "react";
import { chosen } from "../chosen";
import { Panel } from "../panel/panel";
import { cx } from "../variants";

/** The room between the token and its list. */
const PICKER_LIST_GAP_PX = 6;

/** An option: the value the page keeps, its words, and what it may say beside them. */
export type PickerOption<V extends string> = {
  value: V;
  label: string;
  /** A line under its words: what it is, or who it reaches. */
  sub?: string;
  /** A word at its end: a code, a count. */
  meta?: string;
  /** A glyph before its words (the Icon, at 13px): a moment's, a message's state. */
  glyph?: ReactElement;
};

/** A group of options under its heading, or under none. */
export type PickerGroup<V extends string> = { label?: string; options: readonly PickerOption<V>[] };

/**
 * The search at the list's top: its glass (the Icon's `search`, at 12px), what the empty box says, and what none matching
 * does. What it narrows by is an option's words, unless the page says what else finds one (`match`: a language by its
 * code, its own name or its place); typing nothing is the whole list either way.
 */
export type PickerSearch = {
  glass: ReactElement;
  placeholder: string;
  empty: string;
  match?: (option: PickerOption<string>, query: string) => boolean;
};

/** A picker: the one chosen, its options in groups, what it says as one is chosen, its chevron, and its name. */
export type PickerProps<V extends string> = {
  /** What it chooses, to a screen reader ("The moment it runs on"); the token says the one chosen after it. */
  label: string;
  value: V | null;
  onValueChange: (value: V) => void;
  groups: readonly PickerGroup<V>[];
  /** The token's chevron: the Icon's `chevron-down`, at 11px. */
  chevron: ReactElement;
  /** What the token says, where it is not the one chosen's words alone (a glyph beside them, a count after). */
  face?: ReactNode;
  /** What the token says with nothing chosen. */
  placeholder?: string;
  /** A search over the options, for a list too long to walk. */
  search?: PickerSearch;
  /** One line under the list: why something is not offered. */
  note?: ReactNode;
  /** While a save is out: it keeps its focus and opens on nothing new (never `disabled`, which lets focus go). */
  readOnly?: boolean;
  /** The id a test finds the token by (a page's tests and the browser's specs). */
  "data-testid"?: string;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
};

/** What an option holds, in the order the gallery draws it: its glyph, its words and the line under them, its word at the end. */
function optionContent<V extends string>(option: PickerOption<V>, words: ReactNode) {
  return (
    <>
      {option.glyph ? (
        <span className="rec-combo-glyph" aria-hidden="true">
          {option.glyph}
        </span>
      ) : null}
      <span className="rec-combo-words">
        {words}
        {option.sub ? <span className="rec-combo-sub">{option.sub}</span> : null}
      </span>
      {option.meta ? <span className="rec-combo-meta">{option.meta}</span> : null}
    </>
  );
}

/** The token's own words: the face the page gives it, else the one chosen, else what it says with none. */
function tokenFace<V extends string>(props: PickerProps<V>, one: PickerOption<V> | null) {
  return <span className="token-face">{props.face ?? (one ? one.label : (props.placeholder ?? ""))}</span>;
}

/** A short list: Base UI's Select, its token the trigger. */
function PickerList<V extends string>(props: PickerProps<V> & { one: PickerOption<V> | null }) {
  const { label, value, onValueChange, groups, chevron, note, readOnly, className, ref, one } = props;
  const items = groups.flatMap((group) =>
    group.options.map((option) => ({ value: option.value, label: option.label })),
  );
  return (
    <BaseSelect.Root
      value={value}
      onValueChange={(next: V | null) => {
        if (next !== null) onValueChange(next);
      }}
      items={items}
      readOnly={readOnly}
    >
      <BaseSelect.Trigger
        ref={ref}
        className={cx("token", className)}
        aria-label={`${label}: ${one ? one.label : (props.placeholder ?? "none")}`}
        data-testid={props["data-testid"]}
      >
        {tokenFace(props, one)}
        <BaseSelect.Icon className="token-caret">{chevron}</BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          className="pop-place"
          align="start"
          alignItemWithTrigger={false}
          sideOffset={PICKER_LIST_GAP_PX}
        >
          <BaseSelect.Popup className="rec-combo-pop" render={<Panel variant="pop" size="flush" />}>
            <BaseSelect.List className="rec-combo-list">
              {groups.map((group, at) => (
                <BaseSelect.Group key={group.label ?? at} className="rec-combo-group">
                  {group.label ? (
                    <BaseSelect.GroupLabel className="rec-combo-group-label">{group.label}</BaseSelect.GroupLabel>
                  ) : null}
                  {group.options.map((option) => (
                    <BaseSelect.Item
                      key={option.value}
                      value={option.value}
                      label={option.label}
                      className="rec-combo-opt"
                      render={(itemProps, state) => <div {...itemProps} data-chosen={chosen(state)} />}
                    >
                      {optionContent(
                        option,
                        <BaseSelect.ItemText className="rec-combo-label" render={<span />}>
                          {option.label}
                        </BaseSelect.ItemText>,
                      )}
                    </BaseSelect.Item>
                  ))}
                </BaseSelect.Group>
              ))}
            </BaseSelect.List>
            {note ? <p className="rec-combo-note">{note}</p> : null}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

/** A list to search: Base UI's Combobox, its input inside the popup and its token the trigger. */
function PickerFind<V extends string>(props: PickerProps<V> & { one: PickerOption<V> | null; search: PickerSearch }) {
  const { label, onValueChange, groups, chevron, note, readOnly, className, ref, one, search } = props;
  // Base UI's groups: each an `items` array under its heading, the options as the values it hands back.
  const items = useMemo(() => groups.map((group) => ({ value: group.label ?? "", items: group.options })), [groups]);
  return (
    <BaseCombobox.Root
      items={items}
      value={one}
      onValueChange={(next: PickerOption<V> | null) => {
        if (next !== null) onValueChange(next.value);
      }}
      itemToStringLabel={(option: PickerOption<V>) => option.label}
      itemToStringValue={(option: PickerOption<V>) => option.value}
      isItemEqualToValue={(a: PickerOption<V>, b: PickerOption<V>) => a.value === b.value}
      filter={
        search.match ? (option: PickerOption<V>, query: string) => search.match?.(option, query) === true : undefined
      }
      autoHighlight
      readOnly={readOnly}
    >
      <BaseCombobox.Trigger
        ref={ref}
        className={cx("token", className)}
        aria-label={`${label}: ${one ? one.label : (props.placeholder ?? "none")}`}
        data-testid={props["data-testid"]}
      >
        {tokenFace(props, one)}
        <BaseCombobox.Icon className="token-caret">{chevron}</BaseCombobox.Icon>
      </BaseCombobox.Trigger>
      <BaseCombobox.Portal>
        <BaseCombobox.Positioner className="pop-place" align="start" sideOffset={PICKER_LIST_GAP_PX}>
          <BaseCombobox.Popup
            className="rec-combo-pop"
            render={<Panel variant="pop" size="flush" />}
            aria-label={label}
          >
            <span className="rec-combo-field">
              <span className="rec-combo-glass" aria-hidden="true">
                {search.glass}
              </span>
              <BaseCombobox.Input className="rec-combo-input" placeholder={search.placeholder} aria-label={label} />
            </span>
            <BaseCombobox.Empty className="rec-combo-empty">{search.empty}</BaseCombobox.Empty>
            <BaseCombobox.List className="rec-combo-list">
              {(group: { value: string; items: readonly PickerOption<V>[] }) => (
                <BaseCombobox.Group key={group.value} items={group.items} className="rec-combo-group">
                  {group.value ? (
                    <BaseCombobox.GroupLabel className="rec-combo-group-label">{group.value}</BaseCombobox.GroupLabel>
                  ) : null}
                  <BaseCombobox.Collection>
                    {(option: PickerOption<V>) => (
                      <BaseCombobox.Item
                        key={option.value}
                        value={option}
                        className="rec-combo-opt"
                        render={(itemProps, state) => <div {...itemProps} data-chosen={chosen(state)} />}
                      >
                        {optionContent(option, <span className="rec-combo-label">{option.label}</span>)}
                      </BaseCombobox.Item>
                    )}
                  </BaseCombobox.Collection>
                </BaseCombobox.Group>
              )}
            </BaseCombobox.List>
            {note ? <p className="rec-combo-note">{note}</p> : null}
          </BaseCombobox.Popup>
        </BaseCombobox.Positioner>
      </BaseCombobox.Portal>
    </BaseCombobox.Root>
  );
}

/** A picker: a token in its sentence, over a list drawn on the document's body. */
export function Picker<V extends string>(props: PickerProps<V>) {
  const one = props.groups.flatMap((group) => group.options).find((option) => option.value === props.value) ?? null;
  return props.search ? <PickerFind {...props} one={one} search={props.search} /> : <PickerList {...props} one={one} />;
}
