/**
 * Settings' row and its controls, as Autonomy draws them (moved from legacy/pages/settings.jsx, decision 0015 step 11):
 * what a row is on the left and its control on the right, the segmented control, and a dial of a few steps.
 *
 * They are the record kit's now (7 Oct 2026), as Profile's and the Business tab's rows are: a row is the kit's record row
 * with its control as the value, a dial the kit's choice of a few (a radiogroup, one tab stop, the arrows walk it), and the
 * note behind a mark the kit's tip. They were a row, a strip of tab buttons and a mark of the page's own.
 */
import { useId, type ReactNode } from "react";
import { RecordTip, RecordToggleGroup } from "../../kit/record/field";
import { RecordRow, type RecordAct } from "../../kit/record/row";
import type { GateProps } from "../../frame-verbs";
import { choiceAct } from "../choice-act";

/**
 * A settings row: what it is on the left, the control on the right, or its value and its act (`act`: a dial on a phone).
 *
 * The control is named FROM the row. Every switch on this surface rendered as an unlabelled `role="switch"` -- the words
 * that say what it does live in the left column, and nothing tied the two together, so a screen reader announced
 * "switch, on" thirteen times down the Notifications tab. The row mints its label's id and hands it to the control it
 * draws (`control`, given the id), so a control added to a row tomorrow is named too.
 */
export function SetRow({
  label,
  hint,
  note,
  control,
  act = null,
}: {
  label: string;
  hint?: ReactNode;
  note?: string;
  control: (labelId: string) => ReactNode;
  act?: RecordAct | null;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <RecordRow
      id={id}
      label={
        <>
          {label}
          {note && <RecordTip text={note} label={`About ${label}`} />}
        </>
      }
      hint={hint}
      value={control(`rec-row-${id}-key`)}
      act={act}
    />
  );
}

/** What a choice of a few hands to the group it draws: the row's name for it, and a test's handle. */
interface GroupProps {
  "aria-labelledby"?: string;
  "data-testid"?: string;
}

interface SegProps extends GroupProps {
  value: string;
  options: readonly string[];
  onChange: (option: string) => void;
  /** The role gate's props, on every option: a dial a role may not turn says why when pressed. Never on the group. */
  gate?: GateProps | null;
}

/** A choice of a few, side by side: the kit's radiogroup, so the label the row supplies has something to name. */
function SetSeg({ value, options, onChange, gate = null, ...group }: SegProps) {
  return (
    <RecordToggleGroup
      labelledBy={group["aria-labelledby"] ?? null}
      value={value}
      options={options.map((o) => ({ value: o, label: o }))}
      onChange={onChange}
      gate={gate}
      testid={group["data-testid"] ?? null}
    />
  );
}

/**
 * A dial of a few steps (the hold window, the confidence, the budget, the reply cap, the pause): the segmented control
 * on a desktop. Five of them put a 50px strip of 44px buttons under every label on a phone, 110px a row (25 Sep), so
 * there the dial is its row's value and act (dialAct).
 */
export function SetDial({ value, options, onChange, gate = null, ...rest }: SegProps) {
  return <SetSeg value={value} options={options} onChange={onChange} gate={gate} {...rest} />;
}

/**
 * A dial on a phone: its value the row's, and the row's act a menu of the steps, the one in force ticked, as the policy's
 * rows are there (../choice-act.tsx; the phone change list's B3, where the value was a word with a caret inside it).
 */
export function dialAct({
  label,
  value,
  options,
  onChange,
  gate = null,
  testid,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (option: string) => void;
  gate?: GateProps | null;
  testid?: string;
}): RecordAct {
  return choiceAct({
    items: [{ header: label }, ...options.map((o) => ({ label: o, checked: value === o, onClick: () => onChange(o) }))],
    name: `${label}: ${value}`,
    gated: gate && gate["aria-disabled"] ? String(gate["data-tip"]) : null,
    testid,
  });
}
