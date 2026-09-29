/**
 * What the kit's Field takes, proved where the compiler reads it (field.tsx): its label, its hint, what is wrong with it
 * and the glyph that comes with that, and its own box (its words, what it says as they change, its unit, a box of
 * sentences) or another of the kit's controls in its place. A problem with no glyph, a box and a control at once, a
 * box that says nothing as it changes, a unit beside a control, a checkbox (the kit's Switch is one), and a box that is
 * disabled (never: it lets focus go) stop compiling.
 *
 * A type test: the positives are `Holds<Exactly<…>>` (contracts' schema-sets.ts) and calls that compile, and each line
 * under `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * dashboard's `tsc --noEmit` fails. It imports through the kit's index, as a surface does; nothing imports it, so no
 * bundle reaches it, and the calls are in a function nothing calls.
 */
import type { ComponentProps, ReactElement, RefObject } from "react";
import type { Exactly, Holds } from "@chanlytics/contracts";
import type { FieldProps } from "../index";
import { Field } from "../index";

/** Never called: the compiler reads it, and nothing runs it. */
function _fieldTakes(
  glyph: ReactElement,
  select: ReactElement,
  box: RefObject<HTMLInputElement | null>,
  now: { words: string; problem: string | undefined; saving: boolean },
): void {
  const type = (_words: string) => undefined;
  type _Its = [
    Holds<Exactly<ComponentProps<typeof Field>, FieldProps>>,
    Holds<Exactly<FieldProps["problem"], string | undefined>>,
  ];
  Field({
    label: "Booking link",
    value: now.words,
    onValueChange: type,
    hint: "Sent instead of booking a visit itself.",
  });
  Field({
    label: "Least notice",
    value: now.words,
    onValueChange: type,
    unit: "hours",
    type: "number",
    inputMode: "numeric",
  });
  Field({
    label: "Website",
    value: now.words,
    onValueChange: type,
    problem: "A website starts with https://.",
    problemGlyph: glyph,
  });
  Field({
    label: "What fits no field",
    value: now.words,
    onValueChange: type,
    rows: 3,
    readOnly: now.saving,
    ref: box,
  });
  // Another of the kit's controls in the field's place, named, described and marked by it.
  Field({ label: "Service", hint: "What the proposal is for.", control: select, className: "ds-service" });

  // @ts-expect-error what is wrong is said with the one red a field wears, its glyph with it
  Field({ label: "Website", value: now.words, onValueChange: type, problem: "A website starts with https://." });
  // @ts-expect-error a problem known only as the page runs still brings its glyph where it is there
  Field({ label: "Website", value: now.words, onValueChange: type, problem: now.problem, problemGlyph: glyph });
  // @ts-expect-error the field's own box or another control, never both
  Field({ label: "Service", control: select, value: now.words, onValueChange: type });
  // @ts-expect-error a box says what it holds as it changes
  Field({ label: "Website", value: now.words });
  // @ts-expect-error a unit stands beside the field's own box
  Field({ label: "Service", control: select, unit: "hours" });
  // @ts-expect-error its boxes are the browser's own for words, a date, a time or a number: a checkbox is the kit's Switch
  Field({ label: "Take calls", value: now.words, onValueChange: type, type: "checkbox" });
  // @ts-expect-error never disabled, which lets focus go to the page: it is read-only while a save is out
  Field({ label: "Website", value: now.words, onValueChange: type, disabled: true });
}
