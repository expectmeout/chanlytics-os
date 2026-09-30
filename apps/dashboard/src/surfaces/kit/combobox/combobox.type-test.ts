/**
 * What the kit's Combobox takes, proved where the compiler reads it (combobox.tsx): its name, the one chosen or none,
 * the options, what it says as one is chosen, and its glass. The one chosen and what it says are of the options' own
 * values, so a value they do not hold, a box with no name or no glass, and one that is disabled (never: it lets focus
 * go) stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { ComboboxProps, SelectOption } from "../index";
import { Combobox } from "../index";

type Language = "es" | "en";

/** Never called: the compiler reads it, and nothing runs it. */
function _comboboxTakes(
  glass: ReactElement,
  input: RefObject<HTMLInputElement | null>,
  options: readonly SelectOption<Language>[],
  now: { language: Language | null; saving: boolean },
): void {
  const pick = (_language: Language) => undefined;
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Combobox>, ComboboxProps<string>>>,
    Holds<Exactly<ComboboxProps<Language>["value"], Language | null>>,
    Holds<Exactly<ComboboxProps<Language>["onValueChange"], (value: Language) => void>>,
  ];
  Combobox({ label: "Languages", value: now.language, onValueChange: pick, options, glass });
  Combobox({
    label: "Languages",
    value: null,
    onValueChange: pick,
    options,
    glass,
    placeholder: "Add a language",
    readOnly: now.saving,
    ref: input,
    className: "bt-languages",
  });

  // @ts-expect-error the one chosen is one of the options, or none
  Combobox<Language>({ label: "Languages", value: "pt", onValueChange: pick, options, glass });
  // @ts-expect-error the box and its list are named to a screen reader
  Combobox({ value: now.language, onValueChange: pick, options, glass });
  // @ts-expect-error the box is drawn with its glass
  Combobox({ label: "Languages", value: now.language, onValueChange: pick, options });
  // @ts-expect-error never disabled, which lets focus go to the page: it is read-only while a save is out
  Combobox({ label: "Languages", value: now.language, onValueChange: pick, options, glass, disabled: true });
}
