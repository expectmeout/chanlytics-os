/**
 * The record kit: the fields (moved whole from legacy/components/record-field.jsx, decision 0015: the kit's one
 * implementation, which seed-globals publishes under the names the pages that have not moved read).
 *
 * Each is announced as what it is. A field is a label that holds its box; a box in a row of a list carries its name
 * (RecordBox); a switch is role="switch" and says which state it is in; a choice of a few is a radiogroup, one tab stop
 * that the arrows walk; a long list you type into is a combobox (combobox.tsx). None of them knows what it edits, and
 * none has words of its own: every label, hint, option and tip here is the page's. A control that commits takes `gate`
 * (the role gate's props) and spreads it after its handlers, as every committing control here does.
 *
 * Each takes `readOnly`, for the moment its fold's or its row's save is out (fold.tsx says why): a box keeps its words
 * and its focus and takes no typing, a switch and a choice say they are not to be pressed and a press does nothing, and
 * a combobox opens no list. Never `disabled`, which lets go of focus, to the page.
 *
 * Two tiers of tip, and the rule between them: if there is nothing to press in it, it is a chip. RecordTip is the
 * chip, the app's own dark tooltip on a mark; RecordTipCard is the white card, for a tip that carries an act (named
 * apart from .rec-card, the card a page's rows sit in).
 */
import { useId } from "react";
import type { ChangeEvent, ComponentPropsWithoutRef, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { FieldError } from "../field-error/field-error";
import { Icon } from "../icon/icon";
import { can, pickAll } from "./dom";
import { showTip } from "./shell-verbs";

/** The role gate's props, spread onto a committing control after its handlers. */
type Gate = Record<string, unknown>;

/** What both boxes take of their own; anything else goes to the box as it is. */
type BoxOwn = "id" | "value" | "onChange" | "readOnly" | "type" | "size" | "children";
type BoxRest = Omit<ComponentPropsWithoutRef<"input">, BoxOwn>;

interface RecordFieldProps extends BoxRest {
  id?: string | null;
  label: ReactNode;
  value?: string | number | null;
  onChange?: (words: string) => void;
  unit?: ReactNode;
  hint?: ReactNode;
  problem?: ReactNode;
  rows?: number | null;
  testid?: string | null;
  /** The box's own, handed to it as they are: a date, a url; read-only while a save is out. */
  type?: string;
  readOnly?: boolean;
  children?: ReactNode;
}

interface RecordBoxProps extends Omit<BoxRest, "unit"> {
  id: string;
  label: string;
  unit?: ReactNode;
  value?: string | number | null;
  onChange?: (words: string) => void;
  problem?: ReactNode;
  invalid?: string | null;
  readOnly?: boolean;
  type?: string;
  size?: string | null;
  rows?: number | null;
  testid?: string | null;
}

// A field: its label, the box (with its unit when it has one), and under it a hint or what is wrong with it.
//   <RecordField id="lead" label="Least notice" unit="hours" value={v} onChange={setV} hint="Empty means no rule." />
// The label holds the box, so the box is named by it, and by its unit ("Least notice hours"). `problem` is drawn by
// the one FieldError with the id rec-<id>-problem, which the box names in aria-describedby as it marks itself
// aria-invalid; a hint gives way to it. Given no `id`, the field takes one from React's useId, so two fields never
// share a sentence. `rows` makes the box a textarea. onChange hands the page the words. Anything else (inputMode,
// placeholder, maxLength, readOnly, type, onKeyDown, onBlur) goes to the box as it is; the page's own className and
// aria-describedby join the field's, so a consequence line of the page's can describe the box too.
//
// The rest is gathered by hand, not with `...rest` in the parameters. The standalone mockup compiled each file with
// Babel into one shared global scope, and Babel keeps an object rest's excluded keys in a top-level `var _excluded`:
// the last file compiled won, so every earlier rest dropped the wrong keys. It stays gathered by hand.
const REC_FIELD_OWN = new Set([
  "id",
  "label",
  "value",
  "onChange",
  "unit",
  "hint",
  "problem",
  "rows",
  "testid",
  "children",
]);

/** What a box is given beyond its own: everything the page passed that the field or the box does not take itself. */
function boxRest(props: object, own: Set<string>): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) if (!own.has(k)) rest[k] = v;
  return rest;
}

/** A field: a label that holds its box, and under it a hint or what is wrong. */
export function RecordField(props: RecordFieldProps) {
  const { id, label, value, onChange, unit = null, hint = null, problem = null, rows = null, testid = null } = props;
  const autoId = useId();
  const rest = boxRest(props, REC_FIELD_OWN);
  const fieldId = id || autoId;
  const problemId = `rec-${fieldId}-problem`;
  const hintId = `rec-${fieldId}-hint`;
  const describedBy = [problem ? problemId : hint ? hintId : null, rest["aria-describedby"]].filter(Boolean).join(" ");
  const box = {
    ...rest,
    className: ["rec-input", rest.className].filter(Boolean).join(" "),
    value: value == null ? "" : value,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (onChange) onChange(e.target.value);
    },
    "aria-invalid": problem ? true : undefined,
    "aria-describedby": describedBy || undefined,
  };
  const control = rows ? <textarea rows={rows} {...box} /> : <input type="text" {...box} />;
  return (
    <div className="rec-field" data-testid={testid || undefined}>
      <label>
        <span className="rec-field-label">{label}</span>
        {unit ? (
          <span className="rec-input-group" data-invalid={problem ? "true" : undefined}>
            {control}
            <span className="rec-input-unit">{unit}</span>
          </span>
        ) : (
          control
        )}
      </label>
      {problem ? (
        <FieldError id={problemId} message={problem} />
      ) : hint ? (
        <span className="rec-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

// One labelled box for a row of a list: a shift's opening time, a closed day's date, a service's name. The list's header
// names the column and is not read out, so the box carries its own name (`label`, heard, never seen: "Closed from, row
// 2", "Monday closes, second shift"), and it wires what is wrong with it, its unit and the read-only state as RecordField
// does. HOOKLESS, as the rows of a list are (they come and go with their list): so it REQUIRES an `id`, and takes no name
// from React's useId. `problem` is the sentence drawn under the box (the one FieldError, id rec-<id>-problem, which the
// box names as it marks itself aria-invalid); `invalid` is the id of a sentence drawn ELSEWHERE that this box is wrong by
// (a day's two boxes share one), and marks the box the same without drawing it. `size="sm"` is the box at the width of
// a time or a number, record.css's small variant. `type` is the box's (a date, a time, a number); anything else
// (placeholder, min, inputMode, className) goes to the box as it is, as RecordField's rest does, and gathered the same
// way for the same reason. `rows` makes the box a textarea of that many rows, as RecordField's `rows` does, for words in
// a row of a list that run to sentences (a note's text, a message sent in the business's name); a textarea has no
// `type`, so it takes none.
//   <RecordBox id="closure-0-date" label="Closed from, row 1" type="date" value={c.date} onChange={…} problem={bad} />
//   <RecordBox id="note-0-text" label="Note 1, what it says" rows={3} value={n.text} onChange={…} />
const REC_BOX_OWN = new Set([
  "id",
  "label",
  "unit",
  "value",
  "onChange",
  "problem",
  "invalid",
  "readOnly",
  "type",
  "size",
  "rows",
  "testid",
]);

/** One labelled box for a row of a list: hookless, so it needs an id. */
export function RecordBox(props: RecordBoxProps) {
  const { id, label, unit = null, value, onChange, problem = null, invalid = null, readOnly = false } = props;
  const { type = "text", size = null, rows = null, testid = null } = props;
  if (!id)
    throw new TypeError(
      "RecordBox needs an id: it is hookless, so it cannot make one, and its sentence is named by it.",
    );
  const rest = boxRest(props, REC_BOX_OWN);
  const problemId = `rec-${id}-problem`;
  const wrong = problem ? problemId : invalid || null;
  const describedBy = [wrong, rest["aria-describedby"]].filter(Boolean).join(" ");
  const own = {
    ...rest,
    id,
    className: ["rec-input", rest.className].filter(Boolean).join(" "),
    value: value == null ? "" : value,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (onChange) onChange(e.target.value);
    },
    "aria-label": label,
    "aria-invalid": wrong ? true : undefined,
    "aria-describedby": describedBy || undefined,
    readOnly: readOnly || undefined,
  };
  const box = rows ? <textarea {...own} rows={rows} /> : <input {...own} type={type} />;
  return (
    <span className="rec-box" data-size={size || undefined} data-testid={testid || undefined}>
      {unit ? (
        <span className="rec-input-group" data-invalid={wrong ? "true" : undefined}>
          {box}
          <span className="rec-input-unit">{unit}</span>
        </span>
      ) : (
        box
      )}
      {problem ? <FieldError id={problemId} message={problem} /> : null}
    </span>
  );
}

interface RecordSwitchProps {
  on?: boolean;
  onChange?: (next: boolean) => void;
  label?: string | null;
  labelledBy?: string | null;
  describedBy?: string | null;
  readOnly?: boolean;
  gate?: Gate | null;
  testid?: string | null;
}

// A switch: a real button with role="switch". A press asks the page for the other state. `label` names it, or
// `labelledBy` points at the words beside it that already do.
// `describedBy` points at the sentence under the switch's label, where a page has one: the name says WHICH switch and
// the description says what it does, which is what a page whose sentence is not drawn at every width needs (the
// Business tab's rules fold hides its sentences under 761px and keeps them here).
export function RecordSwitch({
  on,
  onChange,
  label = null,
  labelledBy = null,
  describedBy = null,
  readOnly = false,
  gate = null,
  testid = null,
}: RecordSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      className="rec-switch"
      aria-checked={!!on}
      aria-label={labelledBy ? undefined : label || undefined}
      aria-labelledby={labelledBy || undefined}
      aria-describedby={describedBy || undefined}
      aria-disabled={readOnly || undefined}
      data-testid={testid || undefined}
      onClick={() => {
        if (!readOnly && onChange) onChange(!on);
      }}
      {...(gate || {})}
    >
      <span className="rec-knob" aria-hidden="true" />
    </button>
  );
}

/** One option of a choice: its value, its words, and (where choosing it needs saying) a sentence of what it means. */
interface RecordOption<V extends string | number | boolean> {
  value: V;
  label: ReactNode;
  hint?: ReactNode;
}

interface RecordToggleGroupProps<V extends string | number | boolean> {
  id?: string | null;
  label?: string;
  labelledBy?: string | null;
  value?: V | null;
  options?: Array<RecordOption<V>>;
  onChange?: (value: V) => void;
  readOnly?: boolean;
  gate?: Gate | null;
  testid?: string | null;
}

const WALK_STEPS: Partial<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

// A choice of a few, drawn as a segmented control and announced as a radiogroup. It is one tab stop, on the chosen
// option; the arrows pick the next or the one before and take focus there, wrapping at either end, and Home and End
// go to the ends, as a radiogroup's keys do. `options` is [{ value, label, hint? }]. `label` names the group, or
// `labelledBy` points at the words on screen that already do, as a switch's does.
// An option's `hint` is a sentence of what choosing it means, drawn under its label: each option is then a card of the
// two, side by side where they fit and one above the other where they do not (record.css, data-hints), named by its
// label and described by its hint. The group is hookless, so one with hints REQUIRES an `id`, which those words' ids
// are made from, as RecordBox requires one.
export function RecordToggleGroup<V extends string | number | boolean>({
  id = null,
  label,
  labelledBy = null,
  value,
  options = [],
  onChange,
  readOnly = false,
  gate = null,
  testid = null,
}: RecordToggleGroupProps<V>) {
  const at = options.findIndex((o) => o.value === value);
  const refused = readOnly || !!(gate && gate["aria-disabled"]);
  const hints = options.some((o) => !!o.hint);
  if (hints && !id)
    throw new TypeError(
      "RecordToggleGroup needs an id to name its options' hints by: it is hookless, so it cannot make one.",
    );
  const walk = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = options.length;
    const step = WALK_STEPS[e.key];
    if (!n || refused || (!step && e.key !== "Home" && e.key !== "End")) return;
    e.preventDefault();
    const from = at < 0 ? 0 : at;
    const next = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (from + (step ?? 0) + n) % n;
    const chosen = options.at(next);
    if (onChange && chosen) onChange(chosen.value);
    const radios: ArrayLike<HTMLElement> =
      e.currentTarget && can(e.currentTarget, "querySelectorAll") ? pickAll(e.currentTarget, '[role="radio"]') : [];
    if (radios[next] && typeof radios[next].focus === "function") radios[next].focus();
  };
  return (
    // eslint-disable-next-line jsx-a11y-x/interactive-supports-focus -- the group is not a tab stop: its chosen option is, and the arrows walk it
    <div
      className="rec-seg"
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy || undefined}
      onKeyDown={walk}
      data-hints={hints ? "true" : undefined}
      data-testid={testid || undefined}
    >
      {options.map((o, i) => {
        const checked = o.value === value;
        const words = o.hint ? `${id}-${i}` : null;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            className="rec-seg-btn"
            aria-checked={checked}
            aria-disabled={readOnly || undefined}
            aria-labelledby={words ? `${words}-label` : undefined}
            aria-describedby={words ? `${words}-hint` : undefined}
            tabIndex={checked || (at < 0 && i === 0) ? 0 : -1}
            onClick={() => {
              if (!readOnly && onChange) onChange(o.value);
            }}
            {...(gate || {})}
          >
            {words ? (
              <>
                <span className="rec-seg-label" id={`${words}-label`}>
                  {o.label}
                </span>
                <span className="rec-seg-hint" id={`${words}-hint`}>
                  {o.hint}
                </span>
              </>
            ) : (
              o.label
            )}
          </button>
        );
      })}
    </div>
  );
}

// The chip: a tip with nothing to press in it. The mark set-mark already was, given a name: a button carrying
// data-tip, which the app's one tooltip draws on hover and on focus, and which a press shows at once, at the mark,
// because a finger has no hover. `label` is the mark's name; the tip's words are its description, so a screen
// reader hears them too.
export function RecordTip({
  text,
  label = null,
  testid = null,
}: {
  text: string;
  label?: string | null;
  testid?: string | null;
}) {
  return (
    // eslint-disable-next-line jsx-a11y-x/role-supports-aria-props -- the mark's words are its description, so a screen reader hears them
    <button
      type="button"
      className="rec-tip"
      data-tip={text}
      aria-label={label || text}
      aria-description={label ? text : undefined}
      data-testid={testid || undefined}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        showTip(e.currentTarget);
      }}
    >
      <Icon name="info" size={12} />
    </button>
  );
}

// The card: a tip with something to press in it, white with a shadow. The page places it; the kit draws it.
export function RecordTipCard({
  title,
  body = null,
  act = null,
  testid = null,
}: {
  title: ReactNode;
  body?: ReactNode;
  act?: { label: ReactNode; onClick?: () => void; gate?: Gate | null } | null;
  testid?: string | null;
}) {
  return (
    <div
      className="rec-card-tip"
      role="group"
      aria-label={typeof title === "string" ? title : undefined}
      data-testid={testid || undefined}
    >
      <span className="rec-card-tip-title">{title}</span>
      {body ? <span className="rec-card-tip-body">{body}</span> : null}
      {act ? (
        <button type="button" className="rec-card-tip-act" onClick={act.onClick} {...(act.gate || {})}>
          {act.label}
        </button>
      ) : null}
    </div>
  );
}
