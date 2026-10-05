/**
 * Campaigns' choices as the kit's picker takes them (surfaces/kit/picker/picker.tsx): the lists the composers build --
 * a moment, a message, a list, a language, an hour -- each a choice with its words, the line under them, a word at its
 * end, a glyph and a group, turned into the picker's groups under their headings, in the order the groups first appear.
 * The glyphs the picker's token and search take, at the kit's sizes, are here once.
 */
import type { ReactElement } from "react";
import { Icon } from "../../kit/icon/icon";
import type { PickerGroup, PickerOption, PickerSearch } from "../../kit";

/** A choice as Campaigns' lists write one. */
interface CmChoice {
  id: string;
  label: string;
  /** A line under its words. */
  sub?: string | null;
  /** A word at its end: who it reaches today, how many languages. */
  hint?: string | null;
  /** A glyph's name (the Icon's). */
  icon?: string;
  /** A glyph drawn already, where the Icon has none for it (a language's state). */
  glyph?: ReactElement;
  /** Its group's key, whose heading the picker says over it. */
  group?: string;
}

/** The token's chevron, drawn when asked: an element made as this module loads needs React there before any page does. */
export const cmChevron = (): ReactElement => <Icon name="chevron-down" size={11} />;

/** A search over a long list: what its box says, and what it says when nothing matches. */
export const cmSearch = (placeholder: string, empty: string): PickerSearch => ({
  glass: <Icon name="search" size={12} />,
  placeholder,
  empty,
});

/** One choice as the picker's option. */
function optionOf(c: CmChoice): PickerOption<string> {
  const glyph = c.glyph ?? (c.icon ? <Icon name={c.icon} size={13} /> : null);
  return {
    value: c.id,
    label: c.label,
    ...(c.sub ? { sub: c.sub } : {}),
    ...(c.hint ? { meta: c.hint } : {}),
    ...(glyph ? { glyph } : {}),
  };
}

/** The choices in their groups, each under its heading (by its key), in the order the groups first appear. */
export function cmGroups(
  choices: readonly CmChoice[],
  headings: Readonly<Record<string, string>> = {},
): PickerGroup<string>[] {
  const order: string[] = [];
  const byGroup = new Map<string, PickerOption<string>[]>();
  for (const c of choices) {
    const key = c.group ?? "";
    const options = byGroup.get(key) ?? [];
    if (!byGroup.has(key)) {
      byGroup.set(key, options);
      order.push(key);
    }
    options.push(optionOf(c));
  }
  return order.map((key) => {
    const heading = headings[key];
    return { ...(heading ? { label: heading } : {}), options: byGroup.get(key) ?? [] };
  });
}

/** Numbers said in words ("25", "90 days"), as one group: the picker's values are words, the page's numbers. */
export const cmNumbers = (options: readonly { v: number; t: string }[]): PickerGroup<string>[] => [
  { options: options.map((o) => ({ value: String(o.v), label: o.t })) },
];
