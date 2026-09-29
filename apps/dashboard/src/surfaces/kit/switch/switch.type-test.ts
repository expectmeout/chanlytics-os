/**
 * What the kit's Switch takes, proved where the compiler reads it (switch.tsx): whether it is on, what it asks as it is
 * pressed, its name (its own words, or the words beside it) and what describes it. A switch with no name, one with two,
 * one that is disabled (never: it lets focus go) and one whose state is not on or off stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { SwitchProps } from "../index";
import { Switch } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _switchTakes(button: RefObject<HTMLButtonElement | null>, now: { on: boolean; saving: boolean }): void {
  const flip = (_on: boolean) => undefined;
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Switch>, SwitchProps>>,
    Holds<Exactly<SwitchProps["onCheckedChange"], (checked: boolean) => void>>,
  ];
  Switch({ label: "Send it now", checked: now.on, onCheckedChange: flip });
  Switch({
    labelledBy: "set-remind-label",
    describedBy: "set-remind-hint",
    checked: now.on,
    onCheckedChange: flip,
    readOnly: now.saving,
    ref: button,
    className: "set-row-end",
  });

  // @ts-expect-error a switch says which it is by a name: its own words, or the words beside it
  Switch({ checked: now.on, onCheckedChange: flip });
  // @ts-expect-error one name: its own words or the words beside it, not both
  Switch({ label: "Send it now", labelledBy: "set-send-label", checked: now.on, onCheckedChange: flip });
  // @ts-expect-error never disabled, which lets focus go to the page: it is read-only while a save is out
  Switch({ label: "Send it now", checked: now.on, onCheckedChange: flip, disabled: true });
  // @ts-expect-error it is on or off
  Switch({ label: "Send it now", checked: "on", onCheckedChange: flip });
}
