/**
 * The step sheet (moved from legacy/components/step-sheet.jsx, decision 0015, step 5; docs/decisions/0007-person-notes.md,
 * amended: a note may have a day): where a next step is set or changed from outside the notes card, the deal card's "Set a next
 * step" and its Change, and every surface after it that shows a step. Anything asks for it with
 * `openStepSheet({ personId, dealId?, noteId? })`, which says so as a `step:sheet` event; `StepSheetHost`, drawn once by the
 * frame beside the deal sheet, hears it, reads the person through the profile's courier (the tab's copy first) and draws
 * the record kit's sheet.
 *
 * It says nothing of its own. The title, the days it offers, who a step can be for, what it opens with, what is wrong before
 * a round trip and the body the notes route takes are contracts' (`step-sheet.ts`). It holds the fold registry under its own
 * id (`step-sheet`), as the deal sheet does. Save writes through `writePersonNote` with the version the sheet was read at,
 * so a teammate's change since is refused rather than written over; then the sheet closes, says so, and says `note:saved`,
 * which the person page reads again on. Whenever the person is read again with the sheet open, what was typed stays, every
 * field left alone takes the fresh value, and the step's version is the fresh one (contracts `stepSheetMerge`).
 */
import { useEffect, useRef, useState } from "react";
import type { ComponentProps, Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import {
  NOTE_MAX,
  STEP_SHEET_WORDS,
  stepSheetBody,
  stepSheetDirty,
  stepSheetFor,
  stepSheetMerge,
} from "@chanlytics/contracts";
import type { PersonVM, StepDraft, StepSheetVM } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { gate } from "../../legacy-verbs";
import { Confirm } from "../../kit/confirm/confirm";
import { FailedRead } from "../../kit/empty/empty";
import { FieldError } from "../../kit/field-error/field-error";
import { RecordField, RecordToggleGroup } from "../../kit/record/field";
import { useRecordFold } from "../../kit/record/hooks";
import { recFolds } from "../../kit/record/registry";
import { RecordSheet } from "../../kit/record/sheet";
import { DsSelect } from "../deal-sheet/fields";
import { peekPerson, personDetail, writePersonNote } from "../people-detail";
import { hear, saidBy, announce, usePersonToast } from "../person-verbs";
import type { FlashFn } from "../person-verbs";

const STEP_SHEET_ID = "step-sheet";

/** What the sheet is asked for: a person, the deal a new step names, or the step to change. */
interface SsAsk {
  personId: string;
  dealId: string | null;
  noteId: string | null;
}

/** What is wrong with what was typed, under the field it names; no field says it by the Save. */
interface SsProblem {
  field: "what" | "day" | null;
  words: string;
}

/** What the sheet holds: the ask, the person as read, the draft and what it opened with, and where a save stands. */
interface SsState {
  ask: SsAsk | null;
  person: PersonVM | null;
  failed: string | null;
  draft: StepDraft | null;
  opened: StepDraft | null;
  note: { id: string; version: number } | null;
  busy: boolean;
  problem: SsProblem | null;
  armed: boolean;
}

const SS_CLOSED: SsState = {
  ask: null,
  person: null,
  failed: null,
  draft: null,
  opened: null,
  note: null,
  busy: false,
  problem: null,
  armed: false,
};

type SetState = Dispatch<SetStateAction<SsState>>;
type FoldHold = ReturnType<typeof useRecordFold>;

/**
 * Ask for the sheet from anywhere: a person, the deal a new step names, or the step to change. True when it was asked for.
 * Published under `window.openStepSheet` for the pages that have not moved.
 */
export function openStepSheet({
  personId = null,
  dealId = null,
  noteId = null,
}: { personId?: string | null; dealId?: string | null; noteId?: string | null } = {}): boolean {
  if (!personId) return false;
  return announce("step:sheet", { personId, dealId: dealId || null, noteId: noteId || null });
}

/**
 * Something the sheet works out as it draws, tried: the answer, or null with the fault reported. The host is drawn by the
 * frame outside any page's error boundary, so a person it cannot work out is said in the sheet, never a throw.
 */
function worked<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch (err) {
    console.error("The step sheet could not work this out.", err);
    return null;
  }
}

/** The sheet for an ask over a person as read: its words, days and team, worked out on every draw (pure). */
function sheetFor(ask: SsAsk, person: PersonVM): StepSheetVM | null {
  return worked(() => stepSheetFor(person, { noteId: ask.noteId, dealId: ask.dealId }, Date.now(), pageClock().zone()));
}

/** What the sheet opens with, for a person as read, and the step it changes at the version it was opened over. */
function begin(ask: SsAsk, person: PersonVM): SsState {
  const made = sheetFor(ask, person);
  return {
    ...SS_CLOSED,
    ask,
    person,
    draft: made ? made.draft : null,
    opened: made ? made.draft : null,
    note: made ? made.note : null,
  };
}

/**
 * A read of the person, as it lands: a sheet opened before they were read fills in as they land; read again, what was typed
 * stays and the rest, the step's version among it, is the fresh read's. A save still out keeps its draft: its refusal reads
 * them again.
 */
function settleRead(s: SsState, ask: SsAsk, vm: PersonVM | null): SsState {
  if (s.ask !== ask) return s;
  if (!vm) return s.person ? s : { ...s, failed: STEP_SHEET_WORDS.gone };
  if (!s.person) return begin(ask, vm);
  if (s.busy) return { ...s, person: vm };
  const fresh = begin(ask, vm);
  const { draft, opened } = s;
  if (!draft || !opened || !fresh.draft) return { ...fresh, problem: s.problem };
  const fresher = fresh.draft;
  const merged = worked(() => stepSheetMerge(draft, opened, fresher)) || fresher;
  return { ...s, person: vm, draft: merged, opened: fresher, note: fresh.note };
}

/** The person read, through the profile's own courier, each time the sheet opens and after a refusal. */
function readAsk(ask: SsAsk, setSt: SetState): void {
  personDetail(ask.personId).then(
    (vm) => setSt((s) => settleRead(s, ask, vm)),
    (e: unknown) => setSt((s) => (s.ask !== ask || s.person ? s : { ...s, failed: saidBy(e) })),
  );
}

/** When: the picker's days as the kit's toggle group, and the date field for any other day. Hookless. */
function StepSheetWhen({
  sheet,
  draft,
  set,
  problem,
  busy,
}: {
  sheet: StepSheetVM;
  draft: StepDraft;
  set: (patch: Partial<StepDraft>) => void;
  problem: string | null;
  busy: boolean;
}) {
  const W = STEP_SHEET_WORDS;
  return (
    <div className="rec-field step-sheet-when" data-testid="step-sheet-when">
      <span className="rec-field-label" id="step-sheet-when-label">
        {W.when.label}
      </span>
      <RecordToggleGroup
        labelledBy="step-sheet-when-label"
        value={draft.picking ? "pick" : draft.day}
        options={sheet.days.map((c) => ({ value: c.key, label: c.label }))}
        onChange={(v) => set(v === "pick" ? { picking: true } : { picking: false, day: v })}
        readOnly={busy}
        testid="step-sheet-days"
      />
      {draft.picking ? (
        <RecordField
          id="step-sheet-day"
          label={W.when.pick}
          type="date"
          className="deal-sheet-day"
          value={draft.day || ""}
          onChange={(v) => set({ day: v || null })}
          readOnly={busy}
          problem={problem}
          data-testid="step-sheet-day-input"
          testid="step-sheet-day"
        />
      ) : problem ? (
        <FieldError id="step-sheet-when-problem" message={problem} testid="step-sheet-when-problem" />
      ) : null}
    </div>
  );
}

/** What to do, when, and for whom, in that order; then the one rule a step keeps. Hookless. */
function StepSheetFields({
  sheet,
  draft,
  set,
  problem,
  busy,
}: {
  sheet: StepSheetVM;
  draft: StepDraft;
  set: (patch: Partial<StepDraft>) => void;
  problem: SsProblem | null;
  busy: boolean;
}) {
  const W = STEP_SHEET_WORDS;
  const at = (field: string) => (problem && problem.field === field ? problem.words : null);
  return (
    <div className="step-sheet-fields">
      <RecordField
        id="step-sheet-what"
        label={W.what.label}
        placeholder={W.what.placeholder}
        rows={2}
        maxLength={NOTE_MAX}
        value={draft.what}
        onChange={(v) => set({ what: v })}
        readOnly={busy}
        problem={at("what")}
        data-testid="step-sheet-what-input"
        testid="step-sheet-what"
      />
      <StepSheetWhen sheet={sheet} draft={draft} set={set} problem={at("day")} busy={busy} />
      {sheet.team.length > 1 ? (
        <DsSelect
          id="step-sheet-for"
          label={W.for.label}
          value={draft.forId || ""}
          options={sheet.team.map((m) => ({ value: m.id, label: m.label }))}
          onChange={(v) => set({ forId: v || null })}
          busy={busy}
          testid="step-sheet-for"
        />
      ) : null}
      <p className="rec-hint step-sheet-rule" data-testid="step-sheet-rule">
        {W.teamOnly}
      </p>
    </div>
  );
}

/** What the sheet's handlers reach: its state, how it changes, the toast, and the fold's hold. */
interface Host {
  st: SsState;
  setSt: SetState;
  flash: FlashFn;
  fold: RefObject<FoldHold>;
  sheet: StepSheetVM | null;
}

/** What a write that recorded nothing says: the courier's own words, or the throw's. */
async function written(
  personId: string,
  body: Parameters<typeof writePersonNote>[1],
): Promise<{ ok: boolean; message?: string }> {
  try {
    const r = await writePersonNote(personId, body);
    return r.ok ? { ok: true } : { ok: false, message: r.message };
  } catch (err) {
    return { ok: false, message: saidBy(err) };
  }
}

/** Save: the body, or what is wrong with it under its field; the write; then the sheet closes and says so. */
async function save({ st, setSt, flash, fold, sheet }: Host): Promise<void> {
  const { ask, draft } = st;
  if (!sheet || sheet.blocked || st.busy || !draft || !ask) return;
  const W = STEP_SHEET_WORDS;
  const out = stepSheetBody({ note: st.note, dealId: sheet.dealId }, draft);
  if (out.problem) {
    const problem = out.problem;
    setSt((s) => ({ ...s, problem, armed: false }));
    return;
  }
  setSt((s) => ({ ...s, busy: true, problem: null, armed: false }));
  const r = await written(ask.personId, out.body);
  if (!r.ok) {
    setSt((s) => (s.ask !== ask ? s : { ...s, busy: false, problem: { field: null, words: r.message || W.failed } }));
    readAsk(ask, setSt);
    return;
  }
  setSt(SS_CLOSED);
  fold.current.close();
  flash({ msg: <>{W.done[sheet.mode]}</> });
  announce("note:saved", { personId: ask.personId });
}

/** The Confirm that asks about what was typed: the fold's own question, or the sheet's Cancel's. */
function discardAsk(props: Pick<ComponentProps<typeof Confirm>, "onYes" | "onNo" | "testid">) {
  const W = STEP_SHEET_WORDS;
  return (
    <Confirm
      question={W.discard.question}
      detail={W.discard.detail}
      yes={W.discard.yes}
      no={W.discard.no}
      danger
      {...props}
    />
  );
}

/** What stands in the sheet's place: a read that failed, the reading beat, a person that cannot be worked out, or the fields. */
function sheetBody(h: Host, set: (patch: Partial<StepDraft>) => void): ReactNode {
  const { st, setSt, sheet } = h;
  const W = STEP_SHEET_WORDS;
  const retry = () => {
    setSt((s) => ({ ...s, failed: null }));
    if (st.ask) readAsk(st.ask, setSt);
  };
  if (st.failed !== null && !st.person)
    return (
      <FailedRead kind="card" what="this person" why={st.failed || null} onRetry={retry} testid="step-sheet-failed" />
    );
  if (!st.person)
    return (
      <div className="route-reading deal-sheet-reading" role="status">
        {W.reading}
      </div>
    );
  if (!sheet || !st.draft) return <FailedRead kind="card" what="this person" testid="step-sheet-failed" />;
  if (sheet.blocked)
    return (
      <p className="deal-sheet-said" data-testid="step-sheet-blocked">
        {sheet.blocked}
      </p>
    );
  return <StepSheetFields sheet={sheet} draft={st.draft} set={set} problem={st.problem} busy={st.busy} />;
}

/** What the sheet's own presses do: leave, or ask first. */
interface Hands {
  cancel: () => void;
  close: () => void;
}

/** The sheet, over the record kit's: the head, the fields, and the foot's Save and Cancel. */
function drawSheet(h: Host, { cancel, close }: Hands, toastNode: ReactNode) {
  const { st, setSt, sheet } = h;
  const fold = h.fold.current;
  const ask = st.ask;
  if (!ask) return toastNode;
  const W = STEP_SHEET_WORDS;
  const ready = !!(sheet && !sheet.blocked && st.draft);
  const general = st.problem && !st.problem.field ? st.problem.words : null;
  const set = (patch: Partial<StepDraft>) =>
    setSt((s) => (s.busy || !s.draft ? s : { ...s, draft: { ...s.draft, ...patch }, problem: null, armed: false }));
  const notArmed = () => setSt((s) => ({ ...s, armed: false }));
  const confirm = fold.asking
    ? discardAsk({
        onYes: () => {
          setSt(SS_CLOSED);
          fold.discard();
        },
        onNo: () => {
          notArmed();
          fold.stay();
        },
        testid: "step-sheet-ask",
      })
    : st.armed
      ? discardAsk({ onYes: close, onNo: notArmed, testid: "step-sheet-cancel" })
      : null;
  return (
    <>
      <RecordSheet
        id={STEP_SHEET_ID}
        className="deal-sheet step-sheet"
        title={sheet ? sheet.title : W.titles[ask.noteId ? "edit" : "add"]}
        sub={sheet ? sheet.sub : null}
        onClose={cancel}
        onSave={ready ? () => void save(h) : null}
        saving={st.busy}
        saveLabel={sheet ? sheet.save : W.save.add}
        savingLabel={W.saving}
        gate={{ ...gate("approve", "set a step") }}
        confirm={confirm}
        foot={general ? <FieldError id="step-sheet-problem" message={general} testid="step-sheet-problem" /> : null}
      >
        {sheetBody(h, set)}
      </RecordSheet>
      {toastNode}
    </>
  );
}

/** The one step sheet, drawn once by the frame: it draws nothing until it is asked for. */
export function StepSheetHost() {
  const [toastNode, flash] = usePersonToast();
  const [st, setSt] = useState(SS_CLOSED);
  // The sheet as it stands: its words, days and team over the person as read, worked out on every draw (pure).
  const sheet = st.ask && st.person ? sheetFor(st.ask, st.person) : null;
  const { draft, opened } = st;
  const dirty = !!(draft && opened && worked(() => stepSheetDirty(draft, opened)));
  const fold = useRecordFold(STEP_SHEET_ID, { dirty, saving: st.busy });
  // Counted on the page as a fold is (record kit `drawn`), for the shell's life.
  useEffect(() => recFolds.drawn(STEP_SHEET_ID), []);
  const foldNow = useRef(fold);
  foldNow.current = fold;
  useEffect(
    () =>
      hear("step:sheet", (d) => {
        if (typeof d.personId !== "string" || !d.personId) return;
        const asked: SsAsk = {
          personId: d.personId,
          dealId: typeof d.dealId === "string" && d.dealId ? d.dealId : null,
          noteId: typeof d.noteId === "string" && d.noteId ? d.noteId : null,
        };
        const kept = peekPerson(asked.personId);
        setSt(kept ? begin(asked, kept) : { ...SS_CLOSED, ask: asked });
        foldNow.current.request();
        readAsk(asked, setSt);
      }),
    [],
  );
  const close = () => {
    setSt(SS_CLOSED);
    fold.close();
  };
  // Cancel, the head's Close, Escape, a press on the wash and a pull down on a phone: nothing while the save is out, and
  // once, asked, when something was typed.
  const cancel = () => {
    if (st.busy) return;
    if (dirty) {
      setSt((s) => ({ ...s, armed: true }));
      return;
    }
    close();
  };
  if (!fold.open || !st.ask) return toastNode;
  return drawSheet({ st, setSt, flash, fold: foldNow, sheet }, { cancel, close }, toastNode);
}
