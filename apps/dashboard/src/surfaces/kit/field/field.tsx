/**
 * The kit's field (kit.css, "A field" and "FieldError"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md,
 * §3.4 and step 2.5): a label over a box, and under it a hint, or what is wrong with it, in the one red a field
 * wears with its glyph (the Icon's `alert`, which the page hands it). The box is the record kit's (.rec-input), with
 * its unit beside it where it has one, and a box of sentences where it takes `rows`; or it is another of the kit's
 * controls (`control`: a Select, a Combobox, a Switch), which the field names, describes and marks the same. Where the
 * words around a box already say what it is (a title said in place, a search above its list) the label is not drawn,
 * and the box is named by its `aria-label` instead; a title (`shape="title"`) is a box only as it is hovered or touched,
 * and sentences said in place (`shape="words"`) are no box at all: the Panel they stand in is.
 *
 * Its behaviour is Base UI's Field (`@base-ui/react/field`, the plan's decision 15): the label names the control; the
 * hint, or what is wrong, describes it (aria-describedby); a problem marks it invalid (aria-invalid) and is read out
 * as it appears. What is wrong is the page's to say (`problem`: the refusal's words); a hint gives way to it. The kit
 * writes none of the wiring, but for one thing it cannot know: a control that is not Base UI's and is no native one (a
 * contenteditable, the slot box) cannot be a label's `for` nor read the hint, so the page that draws one says what pressing
 * the label does (`onLabelPress`: focus it) and names the hint's id (`hintId`) for the control's `aria-describedby`.
 *
 * It draws what the gallery's Field family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser. `className` is for the page's layout, and comes last; the
 * ref reaches the box.
 */
import { Field as BaseField } from "@base-ui/react/field";
import type { KeyboardEvent, ReactElement, ReactNode, Ref } from "react";
import { Icon } from "../icon/icon";
import { cx } from "../variants";

/** What is wrong with it, in the page's words, and the glyph beside them; or nothing. */
type FieldProblem = { problem: string; problemGlyph: ReactElement } | { problem?: undefined; problemGlyph?: undefined };

/** The kinds of box a field draws: a line of words, or the browser's own for a date, a time, a number. */
type FieldType = "text" | "email" | "tel" | "url" | "search" | "number" | "date" | "time";

/**
 * What names the box: the label drawn over it, or, where the words around it already say what it is (a title, a search
 * above its list), its own `aria-label` and no label drawn.
 */
type FieldName = { label: ReactNode; "aria-label"?: undefined } | { label?: undefined; "aria-label": string };

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
  /** The id a test finds the box by (a page's tests and the browser's specs), on the box itself. */
  "data-testid"?: string;
  /** The page's own keys in the box (Enter saves, Escape leaves), where it has some. */
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  /** The box takes the focus as it appears: a rename that was asked for. */
  autoFocus?: boolean;
  /** Whether the browser checks the spelling of what is typed: off for a name, a code. */
  spellCheck?: boolean;
  /** What the browser may fill it with: a person's name, their number, their address. */
  autoComplete?: string;
  /** What a phone's return key says: the next box, or the act it does. */
  enterKeyHint?: "next" | "go" | "done" | "enter";
  /** The id of the words said for it outside the field (a group's one line, `look="row"`), which describe its box. */
  "aria-describedby"?: string;
  control?: undefined;
} & FieldName;

/**
 * A line of words: an input, whose ref is an input's. Its shape is the record kit's box, or a title said in place (a
 * pane's head: its words as the page's own, a box only as it is hovered or touched).
 */
type FieldLine = FieldWords & {
  rows?: undefined;
  type?: FieldType;
  shape?: "box" | "title";
  ref?: Ref<HTMLInputElement>;
};

/**
 * A box of sentences, this many lines tall: a textarea, whose ref is a textarea's. Its shape is the record kit's box, or
 * sentences said in place (a reply in its row: its words as the page's own, in its type, as tall as they are, the panel
 * they stand in the box: kit.css .rec-input-words, inside a Panel `variant="field"`).
 */
type FieldText = FieldWords & {
  rows: number;
  type?: undefined;
  shape?: "box" | "words";
  ref?: Ref<HTMLTextAreaElement>;
};

/** The field's own box. */
type FieldBox = FieldLine | FieldText;

/** Another of the kit's controls in the field's place: its Select, Combobox or Switch. */
type FieldControl = {
  label: ReactNode;
  "aria-label"?: undefined;
  control: ReactElement;
  value?: undefined;
  onValueChange?: undefined;
  unit?: undefined;
  rows?: undefined;
  shape?: undefined;
  ref?: undefined;
};

/** A field: its label, its hint, what is wrong with it, and its box or control. */
export type FieldProps = {
  hint?: ReactNode;
  className?: string;
  /**
   * How it stands: a label over its box, or a row of a group (`.rec-rows`), its label beside a box the group's inset
   * draws, as a phone's settings rows do (Add people's details, 20 Oct 2026).
   */
  look?: "box" | "row";
  /** Marked wrong where the words for it are said once for its group (a row's), not under it. */
  invalid?: boolean;
  /** Pressing the label: for a control no label can be `for`, which the page hands the focus. */
  onLabelPress?: () => void;
  /** The id the hint is drawn with, for a control that is not Base UI's to point its `aria-describedby` at. */
  hintId?: string;
} & FieldProblem &
  (FieldBox | FieldControl);

/** What a box says is wrong with it, with the kit's glyph, or nothing: the props a field takes for it. */
export function fieldProblem(problem: string | null | undefined): FieldProblem {
  return problem ? { problem, problemGlyph: <Icon name="alert" size={12} /> } : {};
}

/** The field's own box, with its unit, or the box of sentences. */
function Box({ box, invalid }: { box: FieldBox; invalid: boolean }) {
  const { value, onValueChange, unit, placeholder, inputMode, maxLength, readOnly } = box;
  const words = {
    className: cx("rec-input", box.shape === "title" && "rec-input-title", box.shape === "words" && "rec-input-words"),
    value,
    onValueChange: (next: string) => onValueChange(next),
    placeholder,
    inputMode,
    maxLength,
    readOnly,
    "data-testid": box["data-testid"],
    "aria-label": box["aria-label"],
    onKeyDown: box.onKeyDown,
    autoFocus: box.autoFocus,
    spellCheck: box.spellCheck,
    autoComplete: box.autoComplete,
    enterKeyHint: box.enterKeyHint,
    "aria-describedby": box["aria-describedby"],
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
  const invalid = problem !== undefined || !!props.invalid;
  return (
    <BaseField.Root className={cx("rec-field", props.look === "row" && "rec-field-row", className)} invalid={invalid}>
      {label === undefined ? null : (
        <BaseField.Label onClick={props.onLabelPress}>
          <span className="rec-field-label">{label}</span>
        </BaseField.Label>
      )}
      {props.control ?? <Box box={props} invalid={invalid} />}
      {problem !== undefined ? (
        <BaseField.Error match className="field-error" render={<span role="alert" />}>
          {problemGlyph}
          <span className="field-error-words">{problem}</span>
        </BaseField.Error>
      ) : hint ? (
        <BaseField.Description id={props.hintId} className="rec-hint" render={<span />}>
          {hint}
        </BaseField.Description>
      ) : null}
    </BaseField.Root>
  );
}
