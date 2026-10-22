/**
 * The note sheet (moved from legacy/components/step-sheet.jsx, decision 0015, step 5; docs/decisions/0007-person-notes.md,
 * amended: a note may have a day): where a note or a next step is written from outside the notes card, the deal card's
 * "Set a next step" and its Change, every surface after it that shows a step, a visit's "Add a note", and a selection's.
 * A step is a note with a day, so they are one sheet (the sheets as verbs, 14 Oct 2026): opened as a note (`note`), its
 * first day is "No day", under which Team only says whether the receptionist reads it; opened for many (`personIds`), it
 * takes one line each of them gets as a note of their own, through the `note_many` verb, and hands the answer back to the
 * selection that asked (`onDone`). Anything asks for it with
 * `openStepSheet({ personId, dealId?, noteId?, note? })`, which says so as a `step:sheet` event; `StepSheetHost`, drawn once by the
 * frame beside the deal sheet, hears it, reads the person through the profile's courier (the tab's copy first) and draws
 * the record kit's sheet.
 *
 * It says nothing of its own. The title, the days it offers, who a step can be for, what it opens with, what is wrong before
 * a round trip and the body the notes route takes are contracts' (`step-sheet.ts`). It holds the fold registry under its own
 * id (`step-sheet`), as the deal sheet does. Save writes through `writePersonNote` with the version the sheet was read at,
 * so a teammate's change since is refused rather than written over; then the sheet closes and says so. The person's page and
 * the Pipeline's peek read the person again with People, which the write's refresh reads and the live feed tells of
 * (`surface:clients`, 0047); the sheet sends them no event of its own. Whenever the person is read again with the sheet open, what was typed stays, every
 * field left alone takes the fresh value, and the step's version is the fresh one (contracts `stepSheetMerge`).
 */
import { useEffect, useRef, useState } from "react";
import type { ComponentProps, Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import {
  NOTE_LINE_MAX,
  NOTE_MAX,
  NO_DAY,
  STEP_SHEET_WORDS,
  noteManyLine,
  noteSheetFill,
  stepSheetBody,
  stepSheetDirty,
  stepSheetDone,
  stepSheetFor,
  stepSheetMerge,
} from "@chanlytics/contracts";
import type { PersonVM, StepDraft, StepSheetVM } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { gate } from "../../legacy-verbs";
import { Confirm } from "../../kit/confirm/confirm";
import { FailedRead } from "../../kit/empty/empty";
import { FieldError } from "../../kit/field-error/field-error";
import { RecordField, RecordSwitch, RecordToggleGroup } from "../../kit/record/field";
import { useRecordFold } from "../../kit/record/hooks";
import { recFolds } from "../../kit/record/registry";
import { RecordSheet } from "../../kit/record/sheet";
import { Icon } from "../../kit/icon/icon";
import { doAsked } from "../../kit/sheet/back";
import { DsSelect } from "../deal-sheet/fields";
import { SayItLine } from "../deal-sheet/say-it";
import { appendPersonNotesMany, peekPerson, personDetail, writePersonNote } from "../people-detail";
import { hear, saidBy, announce, usePersonToast } from "../person-verbs";
import type { FlashFn } from "../person-verbs";

const STEP_SHEET_ID = "step-sheet";

/** What a selection's note answers the selection that asked: how many it reached. */
interface NoteManyDone {
  done: number;
  failed: number;
  line: string;
}

/**
 * What the sheet is asked for: a person, the deal a new step names (and the act its card leads with, which suggests the
 * step), or the step to change; a note rather than a step; or many people, with what to tell the selection once they
 * have it.
 */
interface SsAsk {
  personId: string;
  dealId: string | null;
  lead: string | null;
  noteId: string | null;
  note: boolean;
  many: string[] | null;
  done: ((r: NoteManyDone) => void) | null;
}

/** What a sheet for many opens with: one line, no day, nobody's in particular. */
const MANY_DRAFT: StepDraft = { what: "", day: NO_DAY, picking: false, forId: null, teamOnly: false };

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
 * Ask for the sheet from anywhere: a person, the deal a new step names, or the step to change; a note (`note`); or a line
 * for many (`personIds`, `onDone`). True when it was asked for. Published under `window.openStepSheet` for the pages
 * that have not moved.
 */
export function openStepSheet({
  personId = null,
  dealId = null,
  lead = null,
  noteId = null,
  note = false,
  personIds = null,
  onDone = null,
}: {
  personId?: string | null;
  dealId?: string | null;
  /** The act the deal's card leads with (dealNextAct's id): a send or a follow-up opens the step filled (stepSheetFor). */
  lead?: string | null;
  noteId?: string | null;
  note?: boolean;
  personIds?: readonly string[] | null;
  onDone?: ((r: NoteManyDone) => void) | null;
} = {}): boolean {
  const many = personIds ? [...new Set(personIds.filter((id) => typeof id === "string" && id))] : [];
  if (many.length) return announce("step:sheet", { personId: many[0], many, onDone, note: true });
  if (!personId) return false;
  return announce("step:sheet", {
    personId,
    dealId: dealId || null,
    lead: lead || null,
    noteId: noteId || null,
    note: note === true,
  });
}

/** An ask, from what the event said: nothing where it names no one. */
function sheetAsk(d: Record<string, unknown>): SsAsk | null {
  if (typeof d.personId !== "string" || !d.personId) return null;
  const many = Array.isArray(d.many) ? d.many.filter((id): id is string => typeof id === "string" && !!id) : [];
  return {
    personId: d.personId,
    dealId: typeof d.dealId === "string" && d.dealId ? d.dealId : null,
    lead: typeof d.lead === "string" && d.lead ? d.lead : null,
    noteId: typeof d.noteId === "string" && d.noteId ? d.noteId : null,
    note: d.note === true,
    many: many.length ? many : null,
    done: typeof d.onDone === "function" ? (d.onDone as (r: NoteManyDone) => void) : null,
  };
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
  return worked(() =>
    stepSheetFor(
      person,
      { noteId: ask.noteId, dealId: ask.dealId, note: ask.note, lead: ask.lead },
      Date.now(),
      pageClock().zone(),
    ),
  );
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

/**
 * When: the picker's days as the kit's toggle group, on one line that scrolls sideways where they run past it, Pick a day
 * its calendar alone; and the date field for any other day. Hookless.
 */
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
        options={sheet.days.map((c) =>
          c.key === "pick"
            ? { value: c.key, label: <Icon name="calendar" size={16} />, name: c.label }
            : { value: c.key, label: c.label },
        )}
        onChange={(v) => set(v === "pick" ? { picking: true } : { picking: false, day: v })}
        readOnly={busy}
        // Chips on one line (the compact sheet, 21 Oct 2026), where wrapping left Pick a day alone on a second row.
        look="chips-sm"
        line
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

/**
 * Who reads it: a note with no day says whether the receptionist does (Team only); a day makes it a step, which only the
 * team sees. Hookless.
 */
function StepSheetReads({
  draft,
  set,
  busy,
}: {
  draft: StepDraft;
  set: (patch: Partial<StepDraft>) => void;
  busy: boolean;
}) {
  const W = STEP_SHEET_WORDS;
  if (draft.day !== NO_DAY || draft.picking)
    return (
      <p className="rec-hint step-sheet-rule" data-testid="step-sheet-rule">
        {W.teamOnly}
      </p>
    );
  return (
    <div className="rec-field step-sheet-reads" data-testid="step-sheet-reads">
      <span className="cl-prof-note-team">
        <RecordSwitch
          on={draft.teamOnly}
          onChange={(on) => set({ teamOnly: on })}
          labelledBy="step-sheet-reads-label"
          describedBy="step-sheet-reads-hint"
          readOnly={busy}
          testid="step-sheet-team-only"
        />
        <span id="step-sheet-reads-label">{W.reads.label}</span>
      </span>
      <span className="rec-hint" id="step-sheet-reads-hint">
        {W.reads.hint}
      </span>
    </div>
  );
}

/**
 * Say it, then what to do, when, and for whom, in that order; then who reads it. They stand in the deal sheet's rhythm
 * (record.css `.deal-sheet-fields`: 18px apart, room under the head), where they stood touching. Hookless.
 */
function StepSheetFields({
  sheet,
  draft,
  set,
  problem,
  busy,
  say,
}: {
  sheet: StepSheetVM;
  draft: StepDraft;
  set: (patch: Partial<StepDraft>) => void;
  problem: SsProblem | null;
  busy: boolean;
  say: ReactNode;
}) {
  const W = STEP_SHEET_WORDS;
  const at = (field: string) => (problem && problem.field === field ? problem.words : null);
  const what = sheet.kind === "note" ? W.noteWhat : W.what;
  return (
    <div className="deal-sheet-fields step-sheet-fields">
      {say}
      <RecordField
        id="step-sheet-what"
        label={what.label}
        placeholder={what.placeholder}
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
      <StepSheetReads draft={draft} set={set} busy={busy} />
    </div>
  );
}

/** A line for many: the one field, and what each of them gets. Hookless. */
function ManyFields({
  draft,
  set,
  problem,
  busy,
}: {
  draft: StepDraft;
  set: (patch: Partial<StepDraft>) => void;
  problem: SsProblem | null;
  busy: boolean;
}) {
  const W = STEP_SHEET_WORDS;
  return (
    <div className="deal-sheet-fields step-sheet-fields">
      <RecordField
        id="step-sheet-what"
        label={W.noteWhat.label}
        placeholder={W.many.placeholder}
        maxLength={NOTE_LINE_MAX}
        value={draft.what}
        onChange={(v) => set({ what: v })}
        readOnly={busy}
        problem={problem && problem.field === "what" ? problem.words : null}
        data-testid="step-sheet-what-input"
        testid="step-sheet-what"
      />
      <p className="rec-hint step-sheet-rule" data-testid="step-sheet-rule">
        {W.many.rule}
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
  const out = stepSheetBody({ note: st.note, dealId: sheet.dealId, kind: sheet.kind }, draft);
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
  flash({ msg: <>{stepSheetDone(sheet, draft)}</> });
  // Nothing more is said: the write's refresh reads People behind it and the live feed tells of the note (0047), and the
  // person's page and the Pipeline's peek read the person again with them (`surface:clients`).
}

/**
 * Save for many: the line, or what is wrong with it under the field; one request through the `note_many` verb; then the
 * sheet closes and the selection that asked is told how many it reached, which it says as its own bar says its acts.
 */
async function saveMany({ st, setSt, flash, fold }: Host): Promise<void> {
  const { ask, draft } = st;
  if (!ask?.many || st.busy || !draft) return;
  const W = STEP_SHEET_WORDS;
  const out = noteManyLine(draft.what);
  if (out.problem !== null) {
    const words = out.problem;
    setSt((s) => ({ ...s, problem: { field: "what", words }, armed: false }));
    return;
  }
  setSt((s) => ({ ...s, busy: true, problem: null, armed: false }));
  let r: Awaited<ReturnType<typeof appendPersonNotesMany>>;
  try {
    r = await appendPersonNotesMany(ask.many, out.line);
  } catch (err) {
    r = { ok: false, done: 0, failed: ask.many.length, message: saidBy(err) };
  }
  if (!r.ok) {
    const words = r.message || W.many.failed;
    setSt((s) => (s.ask !== ask ? s : { ...s, busy: false, problem: { field: null, words } }));
    return;
  }
  setSt(SS_CLOSED);
  fold.current.close();
  if (ask.done) ask.done({ done: r.done, failed: r.failed, line: out.line });
  else flash({ msg: <>{W.done.note}</> });
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
      discard
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
  if (st.failed !== null && !st.person && !st.ask?.many)
    return (
      <FailedRead kind="card" what="this person" why={st.failed || null} onRetry={retry} testid="step-sheet-failed" />
    );
  if (!st.person && !st.ask?.many)
    return (
      <div className="route-reading deal-sheet-reading" role="status">
        {W.reading}
      </div>
    );
  if (st.ask?.many && st.draft) return <ManyFields draft={st.draft} set={set} problem={st.problem} busy={st.busy} />;
  if (!sheet || !st.draft) return <FailedRead kind="card" what="this person" testid="step-sheet-failed" />;
  if (sheet.blocked)
    return (
      <p className="deal-sheet-said" data-testid="step-sheet-blocked">
        {sheet.blocked}
      </p>
    );
  const ask = st.ask;
  const say = ask ? (
    <SayItLine
      personId={ask.personId}
      verb="note"
      busy={st.busy}
      onFill={(dto) => {
        if (dto.verb === "note") set(noteSheetFill(sheet, dto.note));
      }}
      testid="step-sheet-say"
    />
  ) : null;
  return <StepSheetFields sheet={sheet} draft={st.draft} set={set} problem={st.problem} busy={st.busy} say={say} />;
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
  const many = ask.many;
  const ready = many ? !!st.draft : !!(sheet && !sheet.blocked && st.draft);
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
        // Back closes it; a new note or step about one person is named in the address, so a reload opens it again.
        backCloses={many || ask.noteId || ask.dealId ? true : `${ask.note ? "note" : "step"}:${ask.personId}`}
        title={many ? W.titles.note : sheet ? sheet.title : W.titles[ask.noteId ? "edit" : ask.note ? "note" : "add"]}
        sub={many ? W.many.sub(many.length) : sheet ? sheet.sub : null}
        onClose={cancel}
        onSave={ready ? () => void (many ? saveMany(h) : save(h)) : null}
        saving={st.busy}
        saveLabel={many ? W.save.note : sheet ? sheet.save : W.save[ask.note ? "note" : "add"]}
        savingLabel={W.saving}
        gate={{ ...gate("approve", ask.note ? "add a note" : "set a step") }}
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
        const asked = sheetAsk(d);
        if (!asked) return;
        if (asked.many) {
          // Many: nobody to read, one line to write.
          setSt({ ...SS_CLOSED, ask: asked, draft: MANY_DRAFT, opened: MANY_DRAFT });
          foldNow.current.request();
          return;
        }
        const kept = peekPerson(asked.personId);
        setSt(kept ? begin(asked, kept) : { ...SS_CLOSED, ask: asked });
        foldNow.current.request();
        readAsk(asked, setSt);
      }),
    [],
  );
  // A note or a step the address names (`?do=note:<person>`, `?do=step:<person>`) opens as the frame does, once.
  useEffect(() => {
    const note = doAsked("note");
    const step = note ? null : doAsked("step");
    if (note || step) openStepSheet({ personId: note ?? step, note: !!note });
  }, []);
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
