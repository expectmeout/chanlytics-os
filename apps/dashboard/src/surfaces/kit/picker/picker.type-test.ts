/**
 * What the kit's Picker takes, proved where the compiler reads it (picker.tsx): its name, the one chosen or none, its
 * options in groups, what it says as one is chosen, and its chevron; a search and a note where it has them. The one
 * chosen and what it says are of the options' own values, so a value the options do not hold, a token with no chevron,
 * a search with no glass, and a picker that is disabled (never: it lets focus go) stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { PickerGroup, PickerOption, PickerProps } from "../index";
import { Picker } from "../index";

type Hour = "9" | "10";

/** Never called: the compiler reads it, and nothing runs it. */
function _pickerTakes(
  glyphs: { chevron: ReactElement; glass: ReactElement; glyph: ReactElement },
  token: RefObject<HTMLButtonElement | null>,
  groups: readonly PickerGroup<Hour>[],
  now: { hour: Hour | null; saving: boolean },
): void {
  const { chevron, glass, glyph } = glyphs;
  const pick = (_hour: Hour) => undefined;
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Picker>, PickerProps<string>>>,
    Holds<Exactly<PickerProps<Hour>["onValueChange"], (value: Hour) => void>>,
    Holds<
      Exactly<PickerOption<Hour>, { value: Hour; label: string; sub?: string; meta?: string; glyph?: ReactElement }>
    >,
    Holds<Exactly<PickerGroup<Hour>, { label?: string; options: readonly PickerOption<Hour>[] }>>,
  ];
  Picker({ label: "The hour it runs", value: now.hour, onValueChange: pick, groups, chevron });
  // A list to search, a line under it, a face of the page's, read-only while a save is out, the ref and the page's width.
  Picker({
    label: "The hour it runs",
    value: now.hour,
    onValueChange: pick,
    groups: [{ label: "Morning", options: [{ value: "9", label: "09:00", sub: "Before the doors open", glyph }] }],
    chevron,
    search: { glass, placeholder: "Find an hour", empty: "No hour has those words." },
    note: "Hours outside 9 to 21 are not offered.",
    face: "09:00",
    placeholder: "Choose an hour",
    readOnly: now.saving,
    ref: token,
    className: "pb-hour",
    "data-testid": "pb-hour",
  });

  // A search that finds an option by more than its words (a language by its code, its own name or its place).
  Picker({
    label: "The hour it runs",
    value: now.hour,
    onValueChange: pick,
    groups,
    chevron,
    search: {
      glass,
      placeholder: "Find an hour",
      empty: "No hour has those words.",
      match: (option, query) => option.value.startsWith(query),
    },
  });

  // @ts-expect-error the one chosen is one of the options
  Picker<Hour>({ label: "The hour", value: "11", onValueChange: pick, groups, chevron });
  // @ts-expect-error what it says as one is chosen takes the options' values
  Picker<Hour>({ label: "The hour", value: now.hour, onValueChange: (_n: number) => undefined, groups, chevron });
  // @ts-expect-error the token says it opens with its chevron
  Picker({ label: "The hour", value: now.hour, onValueChange: pick, groups });
  const noGlass = { placeholder: "Find an hour", empty: "No hour has those words." };
  // @ts-expect-error a search says where it is, with its glass
  Picker({ label: "The hour", value: now.hour, onValueChange: pick, groups, chevron, search: noGlass });
  // @ts-expect-error never disabled, which lets focus go to the page: it is read-only while a save is out
  Picker({ label: "The hour", value: now.hour, onValueChange: pick, groups, chevron, disabled: true });
}
