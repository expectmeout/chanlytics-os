/**
 * What the kit's Select takes, proved where the compiler reads it (select.tsx): the one chosen, the options, what it
 * says as one is chosen, its chevron, and its name. The one chosen and what it says are of the options' own values, so
 * a value the options do not hold, a box with no chevron, and a select that is disabled (never: it lets focus go)
 * stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { SelectOption, SelectProps } from "../index";
import { Select } from "../index";

type Service = "consult" | "follow";

/** Never called: the compiler reads it, and nothing runs it. */
function _selectTakes(
  chevron: ReactElement,
  box: RefObject<HTMLButtonElement | null>,
  options: readonly SelectOption<Service>[],
  now: { service: Service; saving: boolean },
): void {
  const pick = (_service: Service) => undefined;
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Select>, SelectProps<string>>>,
    Holds<Exactly<SelectProps<Service>["onValueChange"], (value: Service) => void>>,
    Holds<Exactly<SelectOption<Service>, { value: Service; label: string; meta?: string }>>,
  ];
  Select({ value: now.service, onValueChange: pick, options, chevron });
  // Named where no Field names it, read-only while a save is out, with the ref and the page's width.
  Select({
    value: now.service,
    onValueChange: pick,
    options,
    chevron,
    label: "Service",
    readOnly: now.saving,
    ref: box,
    className: "ds-service",
  });

  // @ts-expect-error the one chosen is one of the options
  Select<Service>({ value: "full", onValueChange: pick, options, chevron });
  // @ts-expect-error what it says as one is chosen takes the options' values
  Select<Service>({ value: now.service, onValueChange: (_n: number) => undefined, options, chevron });
  // @ts-expect-error the box says it opens with its chevron
  Select({ value: now.service, onValueChange: pick, options });
  // @ts-expect-error never disabled, which lets focus go to the page: it is read-only while a save is out
  Select({ value: now.service, onValueChange: pick, options, chevron, disabled: true });
}
