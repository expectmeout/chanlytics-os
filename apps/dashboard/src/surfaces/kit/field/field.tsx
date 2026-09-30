/**
 * The kit's field (kit.css, "A field" and "FieldError"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md,
 * §3.4 and step 2.5): a label over a box, and under it a hint, or what is wrong with it, in the one red a field
 * wears with its glyph (the Icon's `alert`, which the page hands it). The box is the record kit's (.rec-input), with
 * its unit beside it where it has one, and a box of sentences where it takes `rows`; or it is another of the kit's
 * controls (`control`: a Select, a Combobox, a Switch), which the field names, describes and marks the same.
 *
 * Its behaviour is Base UI's Field (`@base-ui/react/field`, the plan's decision 15): the label names the control; the
 * hint, or what is wrong, describes it (aria-describedby); a problem marks it invalid (aria-invalid) and is read out
 * as it appears. What is wrong is the page's to say (`problem`: the refusal's words); a hint gives way to it. The kit
 * writes none of the wiring.
 *
 * It draws what the gallery's Field family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser. `className` is for the page's layout, and comes last; the
 * ref reaches the box.
 */
import { Field as BaseField } from "@base-ui/react/field";
import type { ReactElement, ReactNode, Ref } from "react";
import { cx } from "../variants";

/** What is wrong with it, in the page's words, and the glyph beside them; or nothing. */
type FieldProblem = { problem: string; problemGlyph: ReactElement } | { problem?: undefined; problemGlyph?: undefined };

/** The kinds of box a field draws: a line of words, or the browser's own for a date, a time, a number. */
type FieldType = "text" | "email" | "tel" | "url" | "search" | "number" | "date" | "time";

/** What both of the field's own boxes take: its words, what it says as they change, and how it takes them. */
type FieldWords = {
  value: string;
  onValueChange: (value: string) => void;
  /** Its unit, beside the box: "hours", "min". */
  unit?: ReactNode;
  placeholder?: string;
  inputMode?: "text" | "email" | "tel" | "url" | "numeric" | "decimal" | "search";
  maxLength?: number;
  /** While a save is out: it keeps its words and its focus, and takes no typing (never `disabled`). */
  readOnly?: boolean;
  control?: undefined;
};

/** A line of words: an input, whose ref is an input's. */
type FieldLine = FieldWords & { rows?: undefined; type?: FieldType; ref?: Ref<HTMLInputElement> };

/** A box of sentences, this many lines tall: a textarea, whose ref is a textarea's. */
type FieldText = FieldWords & { rows: number; type?: undefined; ref?: Ref<HTMLTextAreaElement> };

/** The field's own box. */
type FieldBox = FieldLine | FieldText;

/** Another of the kit's controls in the field's place: its Select, Combobox or Switch. */
type FieldControl = {
  control: ReactElement;
  value?: undefined;
  onValueChange?: undefined;
  unit?: undefined;
  rows?: undefined;
  ref?: undefined;
};

/** A field: its label, its hint, what is wrong with it, and its box or control. */
export type FieldProps = { label: ReactNode; hint?: ReactNode; className?: string } & FieldProblem &
  (FieldBox | FieldControl);

/** The field's own box, with its unit, or the box of sentences. */
function Box({ box, invalid }: { box: FieldBox; invalid: boolean }) {
  const { value, onValueChange, unit, placeholder, inputMode, maxLength, readOnly } = box;
  const words = {
    className: "rec-input",
    value,
    onValueChange: (next: string) => onValueChange(next),
    placeholder,
    inputMode,
    maxLength,
    readOnly,
  };
  const control =
    box.rows === undefined ? (
      <BaseField.Control ref={box.ref} type={box.type ?? "text"} {...words} />
    ) : (
      <BaseField.Control render={<textarea ref={box.ref} rows={box.rows} />} {...words} />
    );
  if (unit === undefined) return control;
  return (
    <span className="rec-input-group" data-invalid={invalid ? "true" : undefined}>
      {control}
      <span className="rec-input-unit">{unit}</span>
    </span>
  );
}

/** A field: a label, a box or a control, and a hint or what is wrong. */
export function Field(props: FieldProps) {
  const { label, hint, problem, problemGlyph, className } = props;
  const invalid = problem !== undefined;
  return (
    <BaseField.Root className={cx("rec-field", className)} invalid={invalid}>
      <BaseField.Label>
        <span className="rec-field-label">{label}</span>
      </BaseField.Label>
      {props.control ?? <Box box={props} invalid={invalid} />}
      {invalid ? (
        <BaseField.Error match className="field-error" render={<span role="alert" />}>
          {problemGlyph}
          <span className="field-error-words">{problem}</span>
        </BaseField.Error>
      ) : hint ? (
        <BaseField.Description className="rec-hint" render={<span />}>
          {hint}
        </BaseField.Description>
      ) : null}
    </BaseField.Root>
  );
}
