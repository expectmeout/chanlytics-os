/**
 * A step opened (the Steps redesign, his pick of A, refined, 17 Oct 2026): the kit's sheet, from the bottom on a phone and
 * a side pane on a desk, holding everything of one step: its words as one person reads them (a lead's next email as it
 * reads, a call's task), what it is in rows (when it goes, who it keeps going, how, what it is doing, what it did:
 * contracts scheduleStepFacts), and its acts in the foot: Edit, Send me a test, Take away (asked first, in the foot); a
 * sequence to leads' Edit opens its own sheet, where its emails, waits, mailboxes and pace are written whole.
 * Edit changes the step in the same sheet (step-editor.tsx), its Cancel and Save in the sheet's foot (the editor's
 * RecordFootContext); Add a step opens it on the step to come. Open and closed are the schedule's (steps.tsx), so the
 * sheet leaves holding what it held.
 */
import { useMemo, useState } from "react";
import {
  SCHEDULE_WORDS as SW,
  SEQUENCE_FLOW_WORDS as F,
  SEQUENCE_TEST_WORDS as T,
  SEQUENCE_WORDS,
  scheduleDays,
  scheduleStepFacts,
  scheduleStepSub,
  type SequenceRecordDto,
  type SequenceStepDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import { gate, routeDoor } from "../../legacy-verbs";
import { composeRoute } from "../home/address";
import type { LegacyFlash } from "../../legacy-verbs";
import { LeadStepOpen } from "./lead-step";
import { StepEditor } from "./step-editor";
import type { StepsCtx } from "./steps";
import { StepMessageDoor, StepWords, useStepMessageRead } from "./step-words";
import { RecordFootContext } from "./use-record";
import { pressed } from "./verbs";
import type { CmOffered } from "../parts/channels";

type Flash = (flash: LegacyFlash) => void;

/** What the sheet is open on: a step of the sequence, or the step to come (Add a step). */
export type StepSheetTarget = { kind: "step"; id: string } | { kind: "new" };

interface StepSheetProps {
  open: boolean;
  target: StepSheetTarget | null;
  rec: SequenceRecordDto;
  /** Changing it: the editor in the sheet, its Cancel and Save in the foot. */
  edit: boolean;
  /** What a step's state is said from (the schedule's read of who is in it, and the clock). */
  ctx: StepsCtx;
  flash: Flash;
  moved: () => void;
  onEdit: () => void;
  /** The editor's Cancel or Save: back to the step as it reads, or closed for a step that was to come. */
  onEditDone: () => void;
  onClose: () => void;
}

/** A customer's step: one the owner writes, which opens to be changed and may be taken away after the first. */
const ownsWords = (step: SequenceStepDto) => step.kind === "moment" && !step.hand;

/**
 * The step's words: a customer's as one person reads them, with the door to its message in Messages; a lead's next email
 * as it reads; a call's task.
 */
function StepBody(p: { rec: SequenceRecordDto; step: SequenceStepDto; message: CmOffered | null; onEdit: () => void }) {
  const { rec, step, message, onEdit } = p;
  const next = rec.sequence.next;
  if (step.hand) return <p className="sq-msg-none">{step.hand.words}</p>;
  if (rec.sequence.starts === "leads")
    return <LeadStepOpen batch={next && next.place === step.place ? next.id : null} />;
  return (
    <>
      {step.template_name && message ? (
        <StepMessageDoor name={step.template_name} message={message} testid={`sq-step-words-${step.place}`} />
      ) : null}
      <StepWords
        name={step.template_name}
        message={message}
        params={step.params}
        gone={
          <Button size="sm" onClick={onEdit} data-testid={`sq-step-pick-${step.place}`} {...gate("approve")}>
            {F.pickMessage}
          </Button>
        }
        testid={`sq-step-words-${step.place}`}
      />
    </>
  );
}

/** What the step is, row by row: contracts scheduleStepFacts. */
function StepFacts(p: { rec: SequenceRecordDto; step: SequenceStepDto; ctx: StepsCtx; gone: boolean }) {
  const { rec, step } = p;
  return (
    <dl className="sq-facts" data-testid={`sq-step-facts-${step.place}`}>
      {scheduleStepFacts(rec.sequence, step, rec.word, { ...p.ctx, gone: p.gone }).map((f) => (
        <div key={f.label} className="sq-fact">
          <dt>{f.label}</dt>
          <dd className={f.tone === "warn" ? "sq-needs" : undefined}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The foot of a step as it reads: Edit, Send me a test, Take away; or Take away asked, in their place. */
function StepFoot(p: {
  rec: SequenceRecordDto;
  step: SequenceStepDto;
  flash: Flash;
  moved: () => void;
  onEdit: () => void;
  onGone: () => void;
}) {
  const { rec, step, flash } = p;
  const [testing, setTesting] = useState(false);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const test = async () => {
    setTesting(true);
    // Send me a test mails the step's message to the member alone: nothing on the page moves, so nothing is read again.
    await pressed("sequence_test", { sequence_id: rec.sequence.id, step_id: step.id }, flash, () => undefined);
    setTesting(false);
  };
  const remove = async () => {
    setBusy(true);
    const ok = await pressed(
      "sequence_step_remove",
      { sequence_id: rec.sequence.id, step_id: step.id },
      flash,
      p.moved,
    );
    setBusy(false);
    setSure(false);
    if (ok) p.onGone();
  };
  if (sure)
    return (
      <Confirm
        question={F.takeAwayAsk(step.place)}
        detail={F.takeAwayDetail}
        yes={F.takeAway}
        danger
        busy={busy}
        onYes={() => void remove()}
        onNo={() => setSure(false)}
        testid={`sq-step-remove-${step.place}`}
      />
    );
  // A sequence to leads is written whole in its own sheet (its emails, its waits, its mailboxes and pace): Edit opens it.
  if (!ownsWords(step))
    return rec.sequence.starts === "leads" ? (
      <div className="sq-stepfoot">
        <Button
          variant="primary"
          {...routeDoor(composeRoute("every", { edit: rec.sequence.id }))}
          data-testid={`sq-step-edit-${step.place}`}
          {...gate("approve")}
        >
          <Icon name="pencil" size={13} /> {SEQUENCE_WORDS.edit}
        </Button>
      </div>
    ) : null;
  return (
    <div className="sq-stepfoot">
      <Button variant="primary" onClick={p.onEdit} data-testid={`sq-step-edit-${step.place}`} {...gate("approve")}>
        <Icon name="pencil" size={13} /> {SEQUENCE_WORDS.edit}
      </Button>
      {step.template_id ? (
        <Button
          onClick={() => void test()}
          disabled={testing}
          aria-busy={testing}
          title={T.tip}
          data-testid={`sq-step-test-${step.place}`}
          {...gate("approve")}
        >
          <Icon name="send" size={13} /> {testing ? T.sending : T.press}
        </Button>
      ) : null}
      {step.place > 1 ? (
        <Button
          variant="quiet"
          tone="danger"
          className="sq-stepfoot-end"
          onClick={() => setSure(true)}
          data-testid={`sq-step-remove-ask-${step.place}`}
          {...gate("approve")}
        >
          {F.takeAway}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The sheet's head: Add a step and the place it takes; Edit step N over the step's title while it is changed; else the
 * step's message's title (a lead's step and a call by their own names), with its place, its day and its hour under it.
 */
function sheetHead(rec: SequenceRecordDto, step: SequenceStepDto | null, title: string | null, editing: boolean) {
  if (!step) return { title: SW.addStep, sub: SW.step(rec.steps.length + 1) };
  const named = ownsWords(step) ? (title ?? step.template_name ?? step.name) : step.name;
  if (editing) return { title: SW.editStep(step.place), sub: named };
  return { title: named, sub: scheduleStepSub(rec.sequence, step, scheduleDays(rec.steps).get(step.place) ?? 1) };
}

/** The batch that waits for a step, whose people its editor's preview may be read as. */
const waitingFor = (rec: SequenceRecordDto, step: SequenceStepDto | null) =>
  step ? (rec.sequence.needs.batches.find((x) => x.step_id === step.id)?.id ?? null) : null;

export function StepSheet(p: StepSheetProps) {
  const { open, target, rec, edit, ctx, flash, moved } = p;
  const [footEl, setFootEl] = useState<HTMLDivElement | null>(null);
  // The editor's foot is the sheet's while it edits: its Cancel and Save at the thumb, never under a screen of fields.
  const footSlot = useMemo(() => ({ el: footEl, hold: () => undefined }), [footEl]);
  const step = target?.kind === "step" ? (rec.steps.find((s) => s.id === target.id) ?? null) : null;
  const customer = !!step && ownsWords(step);
  const { message, read } = useStepMessageRead(customer ? step.template_name : null, step?.template_language ?? null);
  const adding = target?.kind === "new";
  const editing = edit && (adding || customer);
  const head = sheetHead(rec, step, message?.title ?? null, editing);
  const done = () => {
    p.onEditDone();
    moved();
  };
  return (
    <Sheet
      open={open && (adding || step !== null)}
      onClose={p.onClose}
      title={head.title}
      sub={head.sub}
      close={{ label: SW.close, glyph: <Icon name="x" size={13} /> }}
      backCloses
      testid="sq-step-sheet"
      foot={
        editing ? (
          <div className="sq-stepfoot" ref={setFootEl} />
        ) : step ? (
          <StepFoot rec={rec} step={step} flash={flash} moved={moved} onEdit={p.onEdit} onGone={p.onClose} />
        ) : null
      }
    >
      <RecordFootContext.Provider value={footSlot}>
        {editing ? (
          <StepEditor
            sequenceId={rec.sequence.id}
            step={step}
            policyClass={rec.sequence.first?.policy_class ?? ""}
            batchId={waitingFor(rec, step)}
            flash={flash}
            onDone={done}
            onCancel={p.onEditDone}
          />
        ) : step ? (
          <div className="sq-stepview">
            <StepBody rec={rec} step={step} message={message} onEdit={p.onEdit} />
            <StepFacts rec={rec} step={step} ctx={ctx} gone={customer && read && !message} />
          </div>
        ) : null}
      </RecordFootContext.Provider>
    </Sheet>
  );
}
