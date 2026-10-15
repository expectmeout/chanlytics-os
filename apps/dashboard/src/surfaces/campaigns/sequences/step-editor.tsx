/**
 * A customer's step after the first, opened in place (D6, the canvas's editor): how long after the step before it, what
 * must still be true (they haven't booked, haven't written back), and the message it sends, with a box for each value the
 * message takes that is typed rather than filled by the run (contracts defaultParamSpecs). Saved through the sequence's
 * own doors (00441): a new step at the end, or this one changed; its words changed apart, since a WhatsApp version not
 * yet approved waits while the step sends its own (`waits`). The server judges the values against the message (core
 * templateValues) and says what it refused in words.
 */
import { useMemo, useState } from "react";
import {
  defaultParamSpecs,
  slotLabels,
  type FollowUpCondition,
  type ParamSpec,
  type SequenceStepDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { Select } from "../../kit/select/select";
import { gate } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { cmOfferedFrom } from "../parts/channels";
import { pressed } from "./verbs";

type Flash = (flash: LegacyFlash) => void;

/** The waits a step may take, in days (00440: one to ninety). */
const WAITS = [1, 2, 3, 4, 5, 7, 10, 14, 21, 28, 30, 45, 60, 90] as const;

/** What must still hold, as one choice: the page's four, each a set of conditions. */
const STEP_HOLDS = {
  always: { label: "Whatever they did since", only: [] },
  no_booking: { label: "If they haven’t booked", only: ["no_booking"] },
  no_reply: { label: "If they haven’t written back", only: ["no_reply"] },
  neither: { label: "If they haven’t booked or written back", only: ["no_booking", "no_reply"] },
} as const satisfies Record<string, { label: string; only: readonly FollowUpCondition[] }>;
type Hold = keyof typeof STEP_HOLDS;

const stepHoldOf = (only: readonly string[]): Hold =>
  only.includes("no_booking") && only.includes("no_reply")
    ? "neither"
    : only.includes("no_booking")
      ? "no_booking"
      : only.includes("no_reply")
        ? "no_reply"
        : "always";

const isHold = (v: string): v is Hold => v in STEP_HOLDS;

const chevron = <Icon name="chevron-down" size={12} />;

interface StepEditorProps {
  sequenceId: string;
  /** The step changed, or none for a new one at the end. */
  step: SequenceStepDto | null;
  flash: Flash;
  onDone: () => void;
  onCancel: () => void;
}

export function StepEditor({ sequenceId, step, flash, onDone, onCancel }: StepEditorProps) {
  const settings = useSurface("settings");
  const offered = useMemo(() => cmOfferedFrom(settings) ?? [], [settings]);
  const [days, setDays] = useState(String(step?.after_days ?? 3));
  const [hold, setHold] = useState<Hold>(stepHoldOf(step?.only_if ?? ["no_booking"]));
  const [message, setMessage] = useState<string>(
    () => offered.find((m) => m.name === step?.template_name)?.id ?? offered[0]?.id ?? "",
  );
  const picked = offered.find((m) => m.id === message) ?? null;
  const specs: ParamSpec[] = picked ? defaultParamSpecs(picked) : [];
  const labels = picked ? slotLabels(picked) : [];
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const params = specs.map((s, i) => (s.kind === "text" ? { kind: "text" as const, value: typed[i] ?? "" } : s));
  const wordsChanged = !step || picked?.name !== step.template_name;

  const save = async () => {
    if (!picked) return;
    setBusy(true);
    const only = [...STEP_HOLDS[hold].only];
    const fields = { sequence_id: sequenceId, after_days: Number(days), only_if: only };
    const ok = step
      ? await pressed("sequence_step", { ...fields, step_id: step.id }, flash, () => {})
      : await pressed("sequence_step", { ...fields, template_id: picked.id, params }, flash, () => {});
    // A step that stays gets its new words apart: they may wait for WhatsApp while it sends its own.
    if (ok && step && wordsChanged)
      await pressed(
        "sequence_words",
        { sequence_id: sequenceId, step_id: step.id, template_id: picked.id, params },
        flash,
        () => {},
      );
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <div className="sq-editor" data-testid="sq-editor">
      <div className="sq-editor-row">
        <Field
          label="After the step before"
          control={
            <Select
              value={days}
              onValueChange={setDays}
              chevron={chevron}
              options={WAITS.map((d) => ({ value: String(d), label: d === 1 ? "1 day" : `${d} days` }))}
              data-testid="sq-editor-days"
            />
          }
        />
        <Field
          label="Only"
          control={
            <Select
              value={hold}
              onValueChange={(v) => setHold(isHold(v) ? v : "always")}
              chevron={chevron}
              options={Object.entries(STEP_HOLDS).map(([value, h]) => ({ value, label: h.label }))}
              data-testid="sq-editor-hold"
            />
          }
        />
      </div>
      <Field
        label="Message"
        control={
          <Select
            value={message}
            onValueChange={(v) => {
              setMessage(v);
              setTyped({});
            }}
            chevron={chevron}
            options={offered.map((m) => ({ value: m.id, label: m.title ?? m.name, meta: m.channels.join(", ") }))}
            data-testid="sq-editor-message"
          />
        }
      />
      {specs.map((s, i) =>
        s.kind === "text" ? (
          <Field
            key={`${message}-${i}`}
            label={labels[i] ?? `Value ${i + 1}`}
            value={typed[i] ?? ""}
            onValueChange={(v) => setTyped((t) => ({ ...t, [i]: v }))}
            maxLength={200}
            data-testid={`sq-editor-value-${i}`}
          />
        ) : null,
      )}
      <div className="sq-editor-acts">
        <Button size="sm" onClick={onCancel} data-testid="sq-editor-cancel">
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void save()}
          disabled={busy || !picked}
          data-testid="sq-editor-save"
          {...gate("approve")}
        >
          {step ? "Save" : "Add the step"}
        </Button>
      </div>
    </div>
  );
}
