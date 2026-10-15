/**
 * A sequence's Steps (the canvas's Steps board): its setup said once, as a flow read top to bottom. What starts it; each
 * step with its wait after the one before (a customer's step after the first, D6), its message, the channels it goes by,
 * what it sent and drew back in 30 days, and new words still waiting for WhatsApp; a customer's sequence may take a step
 * more; what stops it; and the one setting left, who approves its batches. A step after the first opens in place to be
 * changed or taken away (step-editor.tsx); every word is contracts' (sequence-words.ts).
 */
import { useState } from "react";
import {
  POLICY_MODE_WORDS,
  SEQUENCE_WORDS,
  sequenceChannelsWords,
  sequenceStartsSentence,
  sequenceStopsSentence,
  sequenceWaitWords,
  type PolicyMode,
  type SequenceRecordDto,
  type SequenceStepDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { gate, openAutonomy } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { StepEditor } from "./step-editor";
import { pressed } from "./verbs";

type Flash = (flash: LegacyFlash) => void;

const isMode = (m: string | null): m is PolicyMode => m !== null && m in POLICY_MODE_WORDS;

/** Whether a sequence takes a step after its first here: a customer's, on a moment or a list (D6). */
const takesFollowUps = (rec: SequenceRecordDto) => rec.sequence.starts === "moment" || rec.sequence.starts === "list";

/** One step of the flow: its number, its words and what it did; a later step's wait above it, and its acts. */
function Step(p: {
  rec: SequenceRecordDto;
  step: SequenceStepDto;
  flash: Flash;
  moved: () => void;
  onEdit: () => void;
}) {
  const { rec, step, flash, moved, onEdit } = p;
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const later = step.place > 1 && step.kind === "moment";
  const remove = async () => {
    setBusy(true);
    await pressed("sequence_step_remove", { sequence_id: rec.sequence.id, step_id: step.id }, flash, moved);
    setBusy(false);
    setSure(false);
  };
  return (
    <li className="sq-step" data-testid={`sq-step-${step.place}`}>
      {step.place > 1 ? <p className="sq-wait">{sequenceWaitWords(step)}</p> : null}
      <div className="sq-step-row">
        <span className="sq-node" aria-hidden="true">
          {step.place}
        </span>
        <div className="sq-step-body">
          <p className="sq-step-line">
            <span className="sq-step-name">{step.name}</span>
            <span className="sq-step-via">{sequenceChannelsWords(step.channels)}</span>
          </p>
          <p className="sq-step-said">
            {step.hand ? step.hand.words : (step.template_name ?? "No message yet")}
            {step.next_words ? (
              <span className="sq-step-next" data-testid={`sq-step-next-${step.place}`}>
                {" "}
                · new words “{step.next_words.name}” wait for WhatsApp
                {step.next_words.status === "rejected" ? ", which did not approve them" : ""}
              </span>
            ) : null}
          </p>
          {later ? (
            sure ? (
              <Confirm
                question={`Take step ${step.place} away?`}
                detail="The steps after it go with it; nobody waiting for it hears more from this sequence."
                yes="Take it away"
                danger
                busy={busy}
                onYes={() => void remove()}
                onNo={() => setSure(false)}
                testid={`sq-step-remove-${step.place}`}
              />
            ) : (
              <div className="sq-step-acts">
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={onEdit}
                  data-testid={`sq-step-edit-${step.place}`}
                  {...gate("approve")}
                >
                  {SEQUENCE_WORDS.edit}
                </Button>
                <Button size="sm" variant="quiet" onClick={() => setSure(true)} {...gate("approve")}>
                  Take away
                </Button>
              </div>
            )
          ) : null}
        </div>
        <p className="sq-step-done tabular">
          <b>{step.sent}</b> sent · <b>{step.replied}</b> replied
          <span className="sq-step-span">last 30 days</span>
        </p>
      </div>
    </li>
  );
}

export function SequenceSteps({ rec, flash, moved }: { rec: SequenceRecordDto; flash: Flash; moved: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const done = () => {
    setEditing(null);
    moved();
  };
  const mode = isMode(rec.mode) ? POLICY_MODE_WORDS[rec.mode].does : POLICY_MODE_WORDS.ask.does;
  return (
    <div className="sq-flow" data-testid="sq-steps">
      <p className="sq-flow-end">
        <span className="sq-flow-k">Starts</span>
        <span>{sequenceStartsSentence(rec.sequence, rec.word, rec.timezone, Date.now())}</span>
      </p>
      <ol className="sq-steps">
        {rec.steps.map((step) =>
          editing === step.id ? (
            <li key={step.id} className="sq-step">
              <StepEditor
                sequenceId={rec.sequence.id}
                step={step}
                flash={flash}
                onDone={done}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <Step key={step.id} rec={rec} step={step} flash={flash} moved={moved} onEdit={() => setEditing(step.id)} />
          ),
        )}
      </ol>
      {takesFollowUps(rec) ? (
        editing === "new" ? (
          <StepEditor
            sequenceId={rec.sequence.id}
            step={null}
            flash={flash}
            onDone={done}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <Button
            size="sm"
            variant="quiet"
            onClick={() => setEditing("new")}
            data-testid="sq-add-step"
            {...gate("approve")}
          >
            <Icon name="plus" size={12} /> {SEQUENCE_WORDS.addFollowUp}
          </Button>
        )
      ) : null}
      <p className="sq-flow-end">
        <span className="sq-flow-k">Stops</span>
        <span>{sequenceStopsSentence(rec.sequence, rec.steps)}</span>
        <span className="sq-flow-src">and never writes to anyone who said stop</span>
      </p>
      <p className="sq-setting">
        <span className="sq-flow-k">{SEQUENCE_WORDS.you}</span>
        <span>{mode}</span>
        <Button size="sm" variant="quiet" onClick={openAutonomy} data-testid="sq-mode">
          {SEQUENCE_WORDS.change}
        </Button>
      </p>
    </div>
  );
}
