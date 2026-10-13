/**
 * A person's notes (moved from legacy/pages/client-profile.jsx, decision 0015, step 5; 0007): each one dated and signed, newest
 * first, the receptionist's suggestions above them until someone keeps or dismisses them. A member writes one, optionally for
 * a teammate ("For Maria") and optionally for the team only (the receptionist never reads it); its author changes it; its
 * author or an owner deletes it. A note may have a day (0007, amended): then it is a step, the team's only, with a Done box
 * anyone who acts may tick, and done it says who did it and when. Every word is contracts' (NOTE_WORDS, personNotesVM,
 * stepDays); the page reads the person again after a write.
 *
 * The card is one component with its hooks (the draft, the note being changed, the one asked about, whether a write is out,
 * whether every note is shown); what it does is `noteActs`, and what it draws is plain functions returning elements.
 */
import { useEffect, useId, useState } from "react";
import type { Dispatch, MouseEvent, ReactNode, SetStateAction } from "react";
import { NOTE_MAX, NOTE_WORDS, composerDays, stepDayName } from "@chanlytics/contracts";
import type { PersonVM } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { holdStill } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { RecordSwitch, RecordToggleGroup } from "../../kit/record/field";
import { tabDraft, useUnsavedWork } from "../../kit/record/work";
import { menuGroups, moreButton } from "../menu-groups";
import { completeStep } from "../../step-done";
import { markStepDone, decidePersonNote, removePersonNote, writePersonNote } from "../people-detail";
import type { FlashFn } from "../person-verbs";

const NOTES_SHOWN = 3;

type Words = typeof NOTE_WORDS;
type Note = PersonVM["noteList"][number];
type Days = ReturnType<typeof composerDays>;

/** What is typed in the composer. */
interface NoteDraft {
  text: string;
  forId: string | null;
  teamOnly: boolean;
  day: string | null;
  picking: boolean;
}

/** A note being changed: what it says now, who it is for, and the version and day it was opened at. */
interface NoteEdit extends NoteDraft {
  id: string;
  version: number;
  hadDay: boolean;
}

const NOTE_EMPTY: NoteDraft = { text: "", forId: null, teamOnly: false, day: null, picking: false };

/** The composer's draft in the tab's memory, by person (the kit's one rule for a composer, kit/record/work.tsx). */
const NOTE_DRAFT = "person-note";

/** What the tab kept for this person's composer, as a draft's shape, or nothing typed. */
function keptDraft(personId: string): NoteDraft {
  const kept: unknown = tabDraft(NOTE_DRAFT, personId);
  if (!kept || typeof kept !== "object") return NOTE_EMPTY;
  const k: Partial<Record<keyof NoteDraft, unknown>> = kept;
  return {
    text: typeof k.text === "string" ? k.text.slice(0, NOTE_MAX) : "",
    forId: typeof k.forId === "string" ? k.forId : null,
    teamOnly: k.teamOnly === true,
    day: typeof k.day === "string" ? k.day : null,
    picking: k.picking === true,
  };
}

/** Up to this many people (you among them), For is a choice of their names; a bigger team keeps the menu. */
const FOR_CHOICES_MAX = 4;

/** For's choices: Anyone, then you, then the rest of the team as the page lists them. */
function forChoices(team: PersonVM["noteTeam"], W: Words) {
  const me = team.filter((m) => m.me);
  const rest = team.filter((m) => !m.me);
  return [
    { value: "", label: W.anyone },
    ...me.map((m) => ({ value: m.id, label: W.me })),
    ...rest.map((m) => ({ value: m.id, label: m.name })),
  ];
}

/**
 * Who a note is for: a choice under its word (Anyone · Me · Jo Park, the kit's toggle group) for a team of up to four; a
 * bigger team keeps the menu, which a row of eight names would not fit. Nothing for a team of one.
 */
function NoteFor({
  team,
  forId,
  onFor,
  disabled,
  W,
}: {
  team: PersonVM["noteTeam"];
  forId: string | null;
  onFor: (id: string | null) => void;
  disabled: boolean;
  W: Words;
}) {
  if (team.length <= 1) return null;
  if (team.length > FOR_CHOICES_MAX)
    return (
      <select
        className="cl-prof-note-for"
        value={forId || ""}
        disabled={disabled}
        aria-label={W.forLabel}
        data-testid="person-note-for"
        onChange={(e) => onFor(e.target.value || null)}
      >
        <option value="">{W.forAnyone}</option>
        {team.map((m) => (
          <option key={m.id} value={m.id}>{`${W.forLabel} ${m.me ? "me" : m.name}`}</option>
        ))}
      </select>
    );
  return (
    <RecordToggleGroup
      label={W.forLabel}
      value={forId || ""}
      options={forChoices(team, W)}
      onChange={(v) => onFor(v || null)}
      readOnly={disabled}
      testid="person-note-for"
    />
  );
}

/** Team only: the kit's switch beside its words (canvas A, M4), on and held while a day makes the note a step. */
function NoteTeam({
  teamOnly,
  onTeamOnly,
  disabled,
  W,
  lockTeam = false,
}: {
  teamOnly: boolean;
  onTeamOnly: (on: boolean) => void;
  disabled: boolean;
  W: Words;
  lockTeam?: boolean;
}) {
  const teamId = useId();
  return (
    <span className="cl-prof-note-team" title={lockTeam ? W.stepTeamOnly : W.teamOnlyHint}>
      <RecordSwitch
        on={!!teamOnly || lockTeam}
        onChange={onTeamOnly}
        labelledBy={teamId}
        readOnly={disabled || lockTeam}
        testid="person-note-team-only"
      />
      <span id={teamId}>{W.teamOnly}</span>
    </span>
  );
}

/**
 * A note's open rows (canvas A, M4): its day under the word Day (the chips), who it is for under For, and the foot with
 * Team only at its start and the acts (`acts`) at its end, over a hairline.
 */
function noteRows(c: Card, d: NoteDraft, set: (next: Partial<NoteDraft>) => void, acts: ReactNode) {
  const W = NOTE_WORDS;
  return (
    <>
      <div className="cl-prof-note-row">
        <span className="cl-prof-note-row-word" aria-hidden="true">
          {W.day}
        </span>
        <NoteDay day={d.day} picking={d.picking} days={c.days} disabled={c.busy} W={W} onDay={(x) => set(x)} />
      </div>
      {c.team.length > 1 ? (
        <div className="cl-prof-note-row">
          <span className="cl-prof-note-row-word" aria-hidden="true">
            {W.forLabel}
          </span>
          <NoteFor team={c.team} forId={d.forId} disabled={c.busy} W={W} onFor={(forId) => set({ forId })} />
        </div>
      ) : null}
      <div className="cl-prof-note-foot">
        <NoteTeam
          teamOnly={d.teamOnly}
          disabled={c.busy}
          W={W}
          lockTeam={!!d.day}
          onTeamOnly={(teamOnly) => set({ teamOnly })}
        />
        <span className="cl-prof-name-acts">{acts}</span>
      </div>
    </>
  );
}

/**
 * A note's day (0007, amended): with one, the note is a step, and the team's. The days are the composer's (contracts
 * composerDays: Today, Tomorrow, Friday or next week, Pick a day) as the kit's chips (canvas A, M4); Pick a day opens the
 * date field, and a press on the day chosen takes it away again. A step whose day is none of them shows it in the date
 * field. Hookless. A call's Call back is the same choice under its own word, from its own three days (call.tsx: `label`,
 * `look`, and its own test ids).
 */
export function NoteDay({
  day,
  picking,
  days,
  onDay,
  disabled,
  W,
  label = W.due,
  testid = "person-note",
  look = "chips-sm",
}: {
  day: string | null;
  picking: boolean;
  days: Days;
  onDay: (d: { picking: boolean; day: string | null }) => void;
  disabled: boolean;
  W: Words;
  label?: string;
  testid?: string;
  look?: "chips" | "chips-sm";
}) {
  const listed = !!day && days.some((c) => c.key === day);
  const chosen = picking || (day && !listed) ? "pick" : day || "";
  return (
    <span className="cl-prof-note-day">
      <RecordToggleGroup
        label={label}
        value={chosen}
        options={days.map((c) => ({ value: c.key, label: c.label }))}
        onChange={(v) =>
          onDay(
            v === chosen
              ? { picking: false, day: null }
              : v === "pick"
                ? { picking: true, day }
                : { picking: false, day: v },
          )
        }
        readOnly={disabled}
        look={look}
        testid={`${testid}-day`}
      />
      {picking || (day && !listed) ? (
        <input
          type="date"
          className="cl-prof-note-for cl-prof-note-date"
          value={day || ""}
          disabled={disabled}
          aria-label={W.pickDay}
          data-testid={`${testid}-date`}
          onChange={(e) => onDay({ picking: true, day: e.target.value || null })}
        />
      ) : null}
    </span>
  );
}

/** What the card holds and can change, handed to what it draws and does. */
interface Card {
  p: PersonVM;
  canEdit: boolean;
  isOwner: boolean;
  flash: FlashFn;
  onChanged: () => void;
  team: PersonVM["noteTeam"];
  days: Days;
  draft: NoteDraft;
  setDraft: Dispatch<SetStateAction<NoteDraft>>;
  editing: NoteEdit | null;
  setEditing: Dispatch<SetStateAction<NoteEdit | null>>;
  asking: string | null;
  setAsking: Dispatch<SetStateAction<string | null>>;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
}

/** What a write answers: `ok`, or the door's own words. */
interface Wrote {
  ok: boolean;
  message?: string;
}

/** What a note does: every write goes through the courier, says so in a toast, and reads the person again. */
function noteActs(c: Card) {
  const { p, flash, draft, editing, setDraft, setEditing, setAsking, setBusy } = c;
  const W = NOTE_WORDS;
  const run = async (fn: () => Promise<Wrote>, done: ReactNode) => {
    if (c.busy) return false;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      flash({ tone: "danger", msg: <>{r.message || "Could not save this note."}</> });
      return false;
    }
    flash({ msg: <>{done}</> });
    c.onChanged();
    return true;
  };
  const add = async () => {
    const text = draft.text.trim();
    // Pick a day with none picked yet: nothing is added, from the button or the keyboard, until one is.
    if (!text || (draft.picking && !draft.day)) return;
    const day = draft.day;
    const ok = await run(
      () =>
        writePersonNote(p.id, {
          body: text,
          for_user_id: draft.forId,
          team_only: draft.teamOnly || !!day,
          ...(day ? { due_on: day } : {}),
        }),
      day ? W.stepAdded : W.added,
    );
    if (ok) setDraft(NOTE_EMPTY);
  };
  const saveEdit = async () => {
    if (!editing) return;
    const text = editing.text.trim();
    if (!text || (editing.picking && !editing.day)) return;
    const day = editing.day;
    const ok = await run(
      () =>
        writePersonNote(p.id, {
          body: text,
          for_user_id: editing.forId,
          team_only: editing.teamOnly || !!day,
          note_id: editing.id,
          version: editing.version,
          // A day kept or changed is sent; one taken away is cleared, and a note that never had one says nothing of it.
          ...(day ? { due_on: day } : editing.hadDay ? { clear_due: true } : {}),
        }),
      day ? W.stepSaved : W.saved,
    );
    if (ok) setEditing(null);
  };
  const remove = async (n: Note) => {
    const ok = await run(() => removePersonNote(p.id, n.id), W.removed);
    if (ok) setAsking(null);
  };
  const decide = (n: Note, keep: boolean) =>
    run(() => decidePersonNote(p.id, { note_id: n.id, keep }), keep ? W.kept : W.dismissed);
  // A step done, or open again, by anyone who acts. Done says what every page says (step-done.tsx): "Step done · its
  // words", with an Undo that opens it again; open again says so.
  const toggleDone = async (n: Note) => {
    if (n.step?.done) return run(() => markStepDone(p.id, n.id, false, n.version), W.stepReopened);
    if (c.busy) return false;
    setBusy(true);
    const ok = await completeStep({
      personId: p.id,
      noteId: n.id,
      words: n.body,
      version: n.version,
      done: markStepDone,
      say: flash,
      onUndone: () => c.onChanged(),
    });
    setBusy(false);
    if (ok) c.onChanged();
    return ok;
  };
  return { add, saveEdit, remove, decide, toggleDone };
}

type Acts = ReturnType<typeof noteActs>;

/** A note being changed: its box, who it is for, its day, and Cancel and Save. */
function editingRow(c: Card, n: Note, edit: NoteEdit, acts: Acts) {
  const { busy, setEditing } = c;
  const W = NOTE_WORDS;
  return (
    <li key={n.id} className="cl-pnote is-editing" data-testid="person-note">
      <textarea
        className="cl-prof-note-input"
        value={edit.text}
        rows={3}
        maxLength={NOTE_MAX}
        disabled={busy}
        aria-label={W.edit}
        data-testid="person-note-edit-input"
        onChange={(e) => setEditing({ ...edit, text: e.target.value })}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void acts.saveEdit();
          if (e.key === "Escape") setEditing(null);
        }}
      />
      {noteRows(
        c,
        edit,
        (next) => setEditing({ ...edit, ...next }),
        <>
          <Button variant="quiet" size="sm" aria-busy={busy || undefined} onClick={() => setEditing(null)}>
            {W.cancel}
          </Button>
          <Button
            size="sm"
            disabled={!edit.text.trim() || (edit.picking && !edit.day)}
            aria-busy={busy || undefined}
            onClick={() => void acts.saveEdit()}
            data-testid="person-note-save"
          >
            {W.save}
          </Button>
        </>,
      )}
    </li>
  );
}

/** A step's line: the Done box for anyone who acts, and what it says. */
function stepLine(c: Card, n: Note, step: NonNullable<Note["step"]>, acts: Acts) {
  const W = NOTE_WORDS;
  return (
    <div className="cl-prof-note-step">
      {c.canEdit ? (
        <label className="cl-prof-note-done-hit">
          <input
            type="checkbox"
            className="cl-prof-note-done"
            checked={step.done}
            disabled={c.busy}
            aria-label={step.done ? `${W.undo}: ${n.body}` : `${W.done}: ${n.body}`}
            onChange={() => void acts.toggleDone(n)}
            data-testid="person-note-done"
          />
        </label>
      ) : null}
      <div className="cl-prof-note-body">{n.body}</div>
    </div>
  );
}

/** A note's ⋯ menu: Edit for its author, Delete for its author or an owner. */
function noteMenu(c: Card, n: Note) {
  const W = NOTE_WORDS;
  const { canEdit, isOwner, days, setEditing, setAsking } = c;
  const mayRemove = canEdit && (n.mine || isOwner);
  const items = [
    ...(canEdit && n.mine
      ? [
          {
            label: W.edit,
            icon: "edit",
            onClick: () => {
              const day = n.step ? n.step.day.day : null;
              setEditing({
                id: n.id,
                text: n.body,
                forId: n.forUserId,
                teamOnly: n.teamOnly,
                version: n.version,
                day,
                hadDay: !!day,
                picking: !!day && !days.some((d) => d.key === day),
              });
            },
          },
        ]
      : []),
    ...(mayRemove ? [{ label: W.remove, icon: "x", danger: true, onClick: () => setAsking(n.id) }] : []),
  ];
  return { items, has: items.length > 0 };
}

/** Delete asked inline, never a dialog: the kit's one confirm, its Yes red, Escape its No. */
function askRemove(c: Card, n: Note, acts: Acts) {
  const W = NOTE_WORDS;
  return (
    <div className="cl-prof-note-ask">
      <Confirm
        danger
        question={W.askRemove}
        yes={W.remove}
        no={W.cancel}
        busy={c.busy}
        onYes={() => void acts.remove(n)}
        onNo={() => c.setAsking(null)}
        testid="person-note-remove"
      />
    </div>
  );
}

/** A kept note: its words or its step, who wrote it and when, its ⋯, and the question if Delete was asked. */
function noteRow(c: Card, n: Note, acts: Acts) {
  const W = NOTE_WORDS;
  const { editing, asking } = c;
  if (editing && editing.id === n.id) return editingRow(c, n, editing, acts);
  const menu = noteMenu(c, n);
  const step = n.step;
  return (
    <li
      key={n.id}
      className={`cl-pnote${n.forMe ? " is-for-me" : ""}${step ? " is-step" : ""}${step && step.done ? " is-done" : ""}`}
      data-testid="person-note"
    >
      {step ? stepLine(c, n, step, acts) : <div className="cl-prof-note-body">{n.body}</div>}
      <div className="cl-prof-note-meta">
        {step ? (
          <span className="cl-prof-note-due" data-due={step.done ? "done" : step.due} data-testid="person-note-due">
            {step.done ? step.doneWords : step.words}
          </span>
        ) : null}
        <span className="cl-prof-note-who">{n.who}</span>
        <span title={n.whenFull}>{n.when}</span>
        {n.edited && <span>{W.edited}</span>}
        {n.forWho && <span className="cl-prof-note-for-who">{n.forWho}</span>}
        {n.teamOnly && !step && (
          <span className="cl-prof-note-lock" title={W.teamOnlyHint}>
            <Icon name="lock" size={10} /> {W.teamOnly}
          </span>
        )}
        {menu.has && asking !== n.id && (
          <span className="cl-prof-note-more">
            <Menu label={W.more} groups={menuGroups(menu.items)} trigger={moreButton({ title: W.more, size: 12 })} />
          </span>
        )}
      </div>
      {asking === n.id && askRemove(c, n, acts)}
    </li>
  );
}

/** The Notes pane's composer (the Overview's, or the third column's at a wide window): where the head's Note goes. */
let noteBox: HTMLTextAreaElement | null = null;
/** Note was pressed before that composer was drawn: it takes the focus as it is. */
let noteAsked = false;

function bringNote(box: HTMLTextAreaElement) {
  box.scrollIntoView({ block: "center" });
  box.focus();
}

/** The pane's composer, as React draws and takes it away; it answers a Note pressed before it was drawn. */
function takeNoteBox(box: HTMLTextAreaElement | null) {
  noteBox = box;
  if (box && noteAsked) {
    noteAsked = false;
    bringNote(box);
  }
}

/**
 * The head's Note: the Notes pane's composer brought into view and focused, at once where it is drawn, else as the
 * page draws it (the Overview's, once Note opened its pane), however many frames that takes.
 */
export function askNoteFocus(): void {
  if (noteBox?.isConnected) bringNote(noteBox);
  else noteAsked = true;
}

/** The one-line composer, whose day, For and Team only appear once something is typed (canvas A, M4). */
function composer(c: Card, acts: Acts, pane = false) {
  const { draft, busy, setDraft } = c;
  const W = NOTE_WORDS;
  const left = NOTE_MAX - draft.text.length;
  return (
    <div className={`cl-prof-note-compose${draft.text ? " is-open" : ""}`}>
      <textarea
        ref={pane ? takeNoteBox : undefined}
        className="cl-prof-note-input"
        value={draft.text}
        rows={draft.text ? 3 : 1}
        maxLength={NOTE_MAX}
        disabled={busy}
        placeholder={W.placeholder}
        aria-label={W.placeholder}
        data-testid="person-notes-input"
        onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void acts.add();
        }}
      />
      {draft.text
        ? noteRows(
            c,
            draft,
            (next) => setDraft({ ...draft, ...next }),
            <>
              {left < 60 && <span className="cl-prof-aut-hint">{W.left(left)}</span>}
              {/* The page's one coral is Open the thread (canvas A, M4): the composer's act is the kit's plain button. */}
              <Button
                disabled={!draft.text.trim() || (draft.picking && !draft.day)}
                aria-busy={busy || undefined}
                onClick={() => void acts.add()}
                data-testid="person-notes-save"
              >
                {/* It says what pressing it makes: a note, or a step and its day (the motion grammar's label). */}
                {draft.day ? W.addStepFor(stepDayName(draft.day, Date.now(), pageClock().zone())) : W.add}
              </Button>
            </>,
          )
        : null}
    </div>
  );
}

/**
 * The receptionist's suggestions (canvas A, `.a-sug`): each an inset row, who suggested it, where it was heard and when
 * over what it says (on a phone too, where nothing hovers), and Keep and Dismiss at its end for someone who may act (under
 * it where the pane is narrow). The date with its year is its hover.
 */
function suggestions(c: Card, waiting: Note[], acts: Acts) {
  const W = NOTE_WORDS;
  return (
    <ul className="cl-prof-sugs">
      {waiting.map((n) => (
        <li key={n.id} className="cl-prof-sug" data-testid="person-note-suggested">
          <div className="cl-prof-sug-words" title={n.whenFull}>
            <span className="cl-prof-sug-from">{W.suggestedLine(n.from, n.when)}</span>
            <span className="cl-prof-sug-text">{n.body}</span>
          </div>
          {c.canEdit && (
            <span className="cl-prof-sug-acts">
              <Button
                size="sm"
                aria-busy={c.busy || undefined}
                onClick={() => void acts.decide(n, true)}
                data-testid="person-note-keep"
              >
                {W.keep}
              </Button>
              <Button
                size="sm"
                aria-busy={c.busy || undefined}
                onClick={() => void acts.decide(n, false)}
                data-testid="person-note-dismiss"
              >
                {W.dismiss}
              </Button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The newest kept note as the Overview draws it (canvas A): an inset, who wrote it and when in the mono eyebrow over its
 * words (two lines at most), its ⋯ beside the eyebrow; a step says its day there and keeps its Done box.
 */
function latestNote(c: Card, n: Note, acts: Acts) {
  const W = NOTE_WORDS;
  if (c.editing && c.editing.id === n.id)
    return <ul className="cl-prof-note-list">{editingRow(c, n, c.editing, acts)}</ul>;
  const menu = noteMenu(c, n);
  const step = n.step;
  return (
    <div className="cl-prof-note-latest" data-testid="person-note">
      <div className="cl-prof-note-eyebrow">
        <span title={n.whenFull}>
          {step ? W.stepEyebrow(n.who, (step.done ? step.doneWords : step.words) ?? "") : W.eyebrow(n.who, n.when)}
        </span>
        {menu.has && c.asking !== n.id && (
          <span className="cl-prof-note-more">
            <Menu label={W.more} groups={menuGroups(menu.items)} trigger={moreButton({ title: W.more, size: 12 })} />
          </span>
        )}
      </div>
      {step ? stepLine(c, n, step, acts) : <div className="cl-prof-note-text">{n.body}</div>}
      {c.asking === n.id && askRemove(c, n, acts)}
    </div>
  );
}

/**
 * A person's notes. In full (History's Notes): the composer, the receptionist's suggestions, then the kept ones, three
 * and the rest behind one press. `compact` is the Overview's pane (canvas A): the newest kept note, the suggestions, and
 * the composer under them; every note is History's.
 */
export function PersonNotes({
  p,
  canEdit,
  isOwner,
  flash,
  onChanged,
  compact = false,
}: {
  p: PersonVM;
  canEdit: boolean;
  isOwner: boolean;
  flash: FlashFn;
  onChanged: () => void;
  compact?: boolean;
}) {
  const W = NOTE_WORDS;
  const notes = p.noteList || [];
  const team = p.noteTeam || [];
  const days = composerDays(Date.now(), pageClock().zone());
  // The draft is held with the person it was typed for, so a move to another person's page never shows, or keeps, it there.
  const [held, setHeld] = useState(() => ({ id: p.id, draft: keptDraft(p.id) }));
  const draft = held.id === p.id ? held.draft : keptDraft(p.id);
  const setDraft: Dispatch<SetStateAction<NoteDraft>> = (next) =>
    setHeld({ id: p.id, draft: typeof next === "function" ? next(draft) : next });
  // Kept in the tab as it is typed, gone once a note is added (the draft empties), and held while the tab closes.
  useUnsavedWork(NOTE_DRAFT, p.id, { value: draft, dirty: !!draft.text.trim(), onLeave: () => setDraft(NOTE_EMPTY) });
  const [editing, setEditing] = useState<NoteEdit | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  useEffect(() => {
    setEditing(null);
    setAsking(null);
  }, [p.id]);
  const card: Card = {
    p,
    canEdit,
    isOwner,
    flash,
    onChanged,
    team,
    days,
    draft,
    setDraft,
    editing,
    setEditing,
    asking,
    setAsking,
    busy,
    setBusy,
  };
  const acts = noteActs(card);
  const waiting = notes.filter((n) => n.suggested);
  const kept = notes.filter((n) => !n.suggested);
  const latest = kept[0];
  if (compact)
    return (
      <div className="cl-prof-notes is-compact" data-testid="person-notes">
        {latest ? latestNote(card, latest, acts) : null}
        {waiting.length > 0 && suggestions(card, waiting, acts)}
        {canEdit && composer(card, acts, true)}
        {!latest && waiting.length === 0 && !canEdit ? <div className="cl-prof-aut-hint">{W.none}</div> : null}
      </div>
    );
  const shown = all ? kept : kept.slice(0, NOTES_SHOWN);
  const toggleAll = (e?: MouseEvent<HTMLElement>) => holdStill(e?.currentTarget, () => setAll(!all));
  let list: ReactNode = null;
  if (kept.length > 0) list = <ul className="cl-prof-note-list">{shown.map((n) => noteRow(card, n, acts))}</ul>;
  else if (waiting.length === 0 && !canEdit) list = <div className="cl-prof-aut-hint">{W.none}</div>;
  return (
    <div className="cl-prof-notes" data-testid="person-notes">
      {canEdit && composer(card, acts)}
      {waiting.length > 0 && suggestions(card, waiting, acts)}
      {list}
      {kept.length > NOTES_SHOWN && (
        <button
          type="button"
          className="cl-bucket-link cl-prof-note-all"
          onClick={toggleAll}
          data-testid="person-notes-all"
        >
          {all ? W.showFewer : W.showAll(kept.length)}
        </button>
      )}
      <div className="cl-prof-aut-hint cl-prof-note-rule">{W.readsHint}</div>
    </div>
  );
}
