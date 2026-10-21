/**
 * A step opened (the Steps redesign, his pick of A, refined, 17 Oct 2026): the kit's sheet, from the bottom on a phone and
 * a side pane on a desk, holding everything of one step: its words as one person reads them (a call's or a note's task as
 * it lands on Today), what it is in rows (when it goes, who it keeps going, how, what it is doing, what it did:
 * contracts scheduleStepFacts), and its acts in the foot: Edit, Send me a test, Take away (asked first, in the foot). A
 * sequence to leads' steps are its own sheet's (leads/step-sheet.tsx).
 * Edit changes the step in the same sheet (step-editor.tsx), its Cancel and Save in the sheet's foot (the editor's
 * RecordFootContext). Add a step opens it on what the step will do (decision 0065 step 6, the New canvas's C6: a message,
 * a call for you or a note for the team, New's own three rows), then on that kind's editor, never a sheet over a sheet.
 * Open and closed are the schedule's (steps.tsx), so the sheet leaves holding what it held.
 */
import { useMemo, useState } from "react";
import {
  NEW_WORDS,
  SCHEDULE_WORDS as SW,
  SEQUENCE_EDIT_WORDS as E,
  SEQUENCE_FLOW_WORDS as F,
  SEQUENCE_TEST_WORDS as T,
  SEQUENCE_WORDS,
  handTitleOf,
  scheduleDays,
  scheduleStepFacts,
  scheduleStepSub,
  type HandKind,
  type NewStepDoes,
  type SequenceRecordDto,
  type SequenceStepDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import { gate } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { cmOfferedFrom } from "../parts/channels";
import { AddStepChoices } from "./new/add-step";
import { HandEditor, StepEditor } from "./step-editor";
import type { StepsCtx } from "./steps";
import { HandTask, StepMessageDoor, StepWords, useStepMessageRead } from "./step-words";
import { RecordFootContext } from "./record-foot";
import { pressed } from "./verbs";
import type { CmOffered } from "../parts/channels";

type Flash = (flash: LegacyFlash) => void;

/** What the sheet is open on: a step of the sequence, or the step to come (Add a step), and what it will do once picked. */
export type StepSheetTarget = { kind: "step"; id: string } | { kind: "new"; does: NewStepDoes | null };

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
  /** What the step to come will do, pressed on the sheet's first face: its editor opens in the same sheet. */
  onPick: (does: NewStepDoes) => void;
  /** The editor's Cancel or Save: back to the step as it reads, or closed for a step that was to come. */
  onEditDone: () => void;
  onClose: () => void;
}

/** A customer's step: one the owner changes (a message, a call or a note), which may be taken away after the first. */
const changes = (step: SequenceStepDto) => step.kind === "moment";
/** A customer's step that sends one of the workspace's messages, whose words are that message's. */
const sendsMessage = (step: SequenceStepDto) => changes(step) && !step.hand;
/** A call's or a note's kind, as the page draws it: a note, else a call. */
const handKind = (step: SequenceStepDto) => (step.hand?.kind === "note" ? "note" : "call");

/**
 * The step's words: a customer's as one person reads them, with the door to its message in Messages; a call's or a note's
 * task as it lands on Today.
 */
function StepBody(p: { rec: SequenceRecordDto; step: SequenceStepDto; message: CmOffered | null; onEdit: () => void }) {
  const { step, message, onEdit } = p;
  if (step.hand)
    return <HandTask kind={handKind(step)} words={step.hand.words} testid={`sq-step-hand-${step.place}`} />;
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

/** The foot of a step as it reads: Edit, Send me a test (a message's), Take away; or Take away asked, in their place. */
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
        // A call or a note is always the last step: nothing goes with it.
        detail={step.hand ? F.takeAwayHandDetail : F.takeAwayDetail}
        yes={F.takeAway}
        danger
        busy={busy}
        onYes={() => void remove()}
        onNo={() => setSure(false)}
        testid={`sq-step-remove-${step.place}`}
      />
    );
  if (!changes(step)) return null;
  // Its acts alone in the foot (kit.css data-foot-acts: one inset all round): Take away, the quiet one, at its start, then
  // Send me a test and Edit, the filled one, at its end (Ruben, 20 Oct 2026: the spacing of the three).
  return (
    <div className="sq-stepfoot" data-foot-acts="">
      {step.place > 1 ? (
        <Button
          variant="quiet"
          tone="danger"
          onClick={() => setSure(true)}
          data-testid={`sq-step-remove-ask-${step.place}`}
          {...gate("approve")}
        >
          {F.takeAway}
        </Button>
      ) : null}
      <span className="sq-stepfoot-sp" />
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
      <Button variant="primary" onClick={p.onEdit} data-testid={`sq-step-edit-${step.place}`} {...gate("approve")}>
        <Icon name="pencil" size={13} /> {SEQUENCE_WORDS.edit}
      </Button>
    </div>
  );
}

/**
 * The sheet's head: Add a step and the place it takes; Edit step N over the step's title while it is changed; else the
 * step's title (its message's, a call's or a note's by its kind, a lead's step by its own name), with its place, its day
 * and its hour under it.
 */
function sheetHead(rec: SequenceRecordDto, step: SequenceStepDto | null, title: string | null, editing: boolean) {
  if (!step) return { title: SW.addStep, sub: SW.step(rec.steps.length + 1) };
  const named = step.hand
    ? handTitleOf(step.hand.kind)
    : sendsMessage(step)
      ? (title ?? step.template_name ?? step.name)
      : step.name;
  if (editing) return { title: SW.editStep(step.place), sub: named };
  return { title: named, sub: scheduleStepSub(rec.sequence, step, scheduleDays(rec.steps).get(step.place) ?? 1) };
}

/** The batch that waits for a step, whose people its editor's preview may be read as. */
const waitingFor = (rec: SequenceRecordDto, step: SequenceStepDto | null) =>
  step ? (rec.sequence.needs.batches.find((x) => x.step_id === step.id)?.id ?? null) : null;

/**
 * What the sheet holds: what the step to come will do (no kind picked yet), a call's or a note's editor, a message's
 * editor, the step as it reads, or nothing.
 */
type Face =
  | { kind: "choose" }
  | { kind: "hand"; hand: HandKind }
  | { kind: "message" }
  | { kind: "view"; step: SequenceStepDto }
  | null;

/** The sheet's face, from what it is open on and whether the owner is changing it. */
function faceOf(target: StepSheetTarget | null, step: SequenceStepDto | null, edit: boolean): Face {
  // The step to come: what it will do until picked, then its editor, which it leaves holding as the sheet closes.
  if (target?.kind === "new") {
    if (target.does === null) return { kind: "choose" };
    return target.does === "message" ? { kind: "message" } : { kind: "hand", hand: target.does };
  }
  if (!step) return null;
  // Changing a step the owner owns: a call's or a note's own editor, else a message's.
  if (edit && changes(step)) return step.hand ? { kind: "hand", hand: handKind(step) } : { kind: "message" };
  return { kind: "view", step };
}

/** The sheet's body, by its face. */
function SheetBody(p: {
  face: Face;
  rec: SequenceRecordDto;
  step: SequenceStepDto | null;
  ctx: StepsCtx;
  flash: Flash;
  message: { message: CmOffered | null; read: boolean };
  onPick: (does: NewStepDoes) => void;
  onEdit: () => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { face, rec, step, flash } = p;
  // Whether the workspace offers a message to pick: with none, A message is said on the first face and not pressed.
  const noMessages = (cmOfferedFrom(useSurface("settings")) ?? []).length === 0;
  if (face?.kind === "choose")
    return (
      // What the step will do (C6): no foot, so the head's close stands in its corner on both widths.
      <div className="sq-stepview" data-testid="sq-add-choices">
        <AddStepChoices
          onAdd={p.onPick}
          messageSaid={noMessages ? E.noMessages : NEW_WORDS.sheets.heldSub}
          messageOff={noMessages}
          testid="sq-add"
        />
      </div>
    );
  if (face?.kind === "hand")
    return (
      <HandEditor
        key={step?.id ?? `new-${face.hand}`}
        sequenceId={rec.sequence.id}
        step={step}
        kind={face.hand}
        flash={flash}
        onDone={p.onDone}
        onCancel={p.onCancel}
      />
    );
  if (face?.kind === "message")
    return (
      <StepEditor
        sequenceId={rec.sequence.id}
        step={step}
        policyClass={rec.sequence.first?.policy_class ?? ""}
        batchId={waitingFor(rec, step)}
        flash={flash}
        onDone={p.onDone}
        onCancel={p.onCancel}
      />
    );
  if (face?.kind !== "view") return null;
  return (
    <div className="sq-stepview">
      <StepBody rec={rec} step={face.step} message={p.message.message} onEdit={p.onEdit} />
      <StepFacts
        rec={rec}
        step={face.step}
        ctx={p.ctx}
        gone={sendsMessage(face.step) && p.message.read && !p.message.message}
      />
    </div>
  );
}

export function StepSheet(p: StepSheetProps) {
  const { open, target, rec, edit, flash, moved } = p;
  const [footEl, setFootEl] = useState<HTMLDivElement | null>(null);
  // The editor's foot is the sheet's while it edits: its Cancel and Save at the thumb, never under a screen of fields.
  const footSlot = useMemo(() => ({ el: footEl, hold: () => undefined }), [footEl]);
  const step = target?.kind === "step" ? (rec.steps.find((s) => s.id === target.id) ?? null) : null;
  const message = useStepMessageRead(
    step && sendsMessage(step) ? step.template_name : null,
    step?.template_language ?? null,
  );
  const face = faceOf(target, step, edit);
  const editing = face?.kind === "hand" || face?.kind === "message";
  const head = sheetHead(rec, step, message.message?.title ?? null, editing);
  const done = () => {
    p.onEditDone();
    moved();
  };
  return (
    <Sheet
      open={open && face !== null}
      onClose={p.onClose}
      title={head.title}
      sub={head.sub}
      close={{ label: SW.close, glyph: <Icon name="x" size={13} /> }}
      backCloses
      testid="sq-step-sheet"
      foot={
        editing ? (
          // The editor's Cancel and Save: the kit's pair (kit.css data-foot-pair), an equal pair on a phone, Save first.
          <div className="sq-stepfoot" data-foot-pair="" ref={setFootEl} />
        ) : face?.kind === "view" ? (
          <StepFoot rec={rec} step={face.step} flash={flash} moved={moved} onEdit={p.onEdit} onGone={p.onClose} />
        ) : null
      }
    >
      <RecordFootContext.Provider value={footSlot}>
        <SheetBody
          face={face}
          rec={rec}
          step={step}
          ctx={p.ctx}
          flash={flash}
          message={message}
          onPick={p.onPick}
          onEdit={p.onEdit}
          onDone={done}
          onCancel={p.onEditDone}
        />
      </RecordFootContext.Provider>
    </Sheet>
  );
}
