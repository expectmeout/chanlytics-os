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
import { useEffect, useState } from "react";
import type { Dispatch, MouseEvent, ReactNode, SetStateAction } from "react";
import { NOTE_MAX, NOTE_WORDS, composerDays, stepDayName } from "@chanlytics/contracts";
import type { PersonVM } from "@chanlytics/contracts";
import { pageClock } from "@/legacy-bridge/zone";
import { holdStill } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { RecordToggleGroup } from "../../kit/record/field";
import { tabDraft, useUnsavedWork } from "../../kit/record/work";
import { menuGroups, moreButton } from "../menu-groups";
import { markStepDone, decidePersonNote, removePersonNote, writePersonNote } from "../people-detail";
import { openStepSheet } from "../step-sheet/step-sheet";
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
 * Who a note is for and whether the receptionist reads it: the composer's and the editor's two controls, one shape. For
 * is a choice under its word (Anyone · Me · Jo Park, the kit's toggle group) for a team of up to four; a bigger team keeps
 * the menu, which a row of eight names would not fit.
 */
function NoteAudience({
  team,
  forId,
  teamOnly,
  onFor,
  onTeamOnly,
  disabled,
  W,
  lockTeam = false,
}: {
  team: PersonVM["noteTeam"];
  forId: string | null;
  teamOnly: boolean;
  onFor: (id: string | null) => void;
  onTeamOnly: (on: boolean) => void;
  disabled: boolean;
  W: Words;
  lockTeam?: boolean;
}) {
  return (
    <span className="cl-prof-note-aud">
      {team.length > 1 && team.length <= FOR_CHOICES_MAX ? (
        <span className="cl-prof-note-choose">
          <span className="cl-prof-note-choose-word" aria-hidden="true">
            {W.forLabel}
          </span>
          <RecordToggleGroup
            label={W.forLabel}
            value={forId || ""}
            options={forChoices(team, W)}
            onChange={(v) => onFor(v || null)}
            readOnly={disabled}
            testid="person-note-for"
          />
        </span>
      ) : null}
      {team.length > FOR_CHOICES_MAX && (
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
      )}
      <label className="cl-prof-note-team" title={lockTeam ? W.stepTeamOnly : W.teamOnlyHint}>
        <input
          type="checkbox"
          checked={!!teamOnly || lockTeam}
          disabled={disabled || lockTeam}
          onChange={(e) => onTeamOnly(e.target.checked)}
          data-testid="person-note-team-only"
        />
        <span>{W.teamOnly}</span>
      </label>
    </span>
  );
}

/**
 * A note's day (0007, amended): with one, the note is a step, and the team's. The days are the composer's three (contracts
 * composerDays: Tomorrow, Friday or next week, Pick a day), the kit's toggle group; Pick a day opens the date field, and
 * a press on the day chosen takes it away again. A step whose day is none of the three shows it in the date field. Hookless.
 * A call's Call back is the same choice under its own word (call.tsx: `label`, and its own test ids).
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
}: {
  day: string | null;
  picking: boolean;
  days: Days;
  onDay: (d: { picking: boolean; day: string | null }) => void;
  disabled: boolean;
  W: Words;
  label?: string;
  testid?: string;
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
  const run = async (
    fn: () => Promise<Wrote>,
    done: string,
    action: { label: string; onClick: () => void } | null = null,
  ) => {
    if (c.busy) return false;
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      flash({ tone: "danger", msg: <>{r.message || "Could not save this note."}</> });
      return false;
    }
    flash({ msg: <>{done}</>, ...(action ? { action } : {}) });
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
  // A step done, or open again, by anyone who acts. Done, the toast offers the next one, on the same deal.
  const toggleDone = (n: Note) => {
    const done = !n.step?.done;
    const next = done
      ? { label: W.setTheNext, onClick: () => openStepSheet({ personId: p.id, dealId: n.dealId }) }
      : null;
    return run(() => markStepDone(p.id, n.id, done, n.version), done ? W.stepDone : W.stepReopened, next);
  };
  return { add, saveEdit, remove, decide, toggleDone };
}

type Acts = ReturnType<typeof noteActs>;

/** A note being changed: its box, who it is for, its day, and Cancel and Save. */
function editingRow(c: Card, n: Note, edit: NoteEdit, acts: Acts) {
  const { team, days, busy, setEditing } = c;
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
      <div className="cl-prof-note-bar">
        <NoteAudience
          team={team}
          forId={edit.forId}
          teamOnly={edit.teamOnly}
          disabled={busy}
          W={W}
          lockTeam={!!edit.day}
          onFor={(forId) => setEditing({ ...edit, forId })}
          onTeamOnly={(teamOnly) => setEditing({ ...edit, teamOnly })}
        />
        <NoteDay
          day={edit.day}
          picking={edit.picking}
          days={days}
          disabled={busy}
          W={W}
          onDay={(d) => setEditing({ ...edit, ...d })}
        />
        <span className="cl-prof-name-acts">
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(null)}>
            {W.cancel}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={busy || !edit.text.trim() || (edit.picking && !edit.day)}
            onClick={() => void acts.saveEdit()}
            data-testid="person-note-save"
          >
            {W.save}
          </button>
        </span>
      </div>
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

/** Delete asked inline, never a dialog. */
function askRemove(c: Card, n: Note, acts: Acts) {
  const W = NOTE_WORDS;
  return (
    <div className="cl-prof-note-ask" role="alert">
      <span>{W.askRemove}</span>
      <span className="cl-prof-name-acts">
        <button type="button" className="btn btn-ghost btn-sm" disabled={c.busy} onClick={() => c.setAsking(null)}>
          {W.cancel}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-danger"
          disabled={c.busy}
          onClick={() => void acts.remove(n)}
          data-testid="person-note-remove"
        >
          {W.remove}
        </button>
      </span>
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

/** The one-line composer, whose For and Team only appear once something is typed. */
function composer(c: Card, acts: Acts) {
  const { draft, team, days, busy, setDraft } = c;
  const W = NOTE_WORDS;
  const left = NOTE_MAX - draft.text.length;
  return (
    <div className={`cl-prof-note-compose${draft.text ? " is-open" : ""}`}>
      <textarea
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
      {draft.text && (
        <div className="cl-prof-note-bar">
          <NoteAudience
            team={team}
            forId={draft.forId}
            teamOnly={draft.teamOnly}
            disabled={busy}
            W={W}
            lockTeam={!!draft.day}
            onFor={(forId) => setDraft({ ...draft, forId })}
            onTeamOnly={(teamOnly) => setDraft({ ...draft, teamOnly })}
          />
          <NoteDay
            day={draft.day}
            picking={draft.picking}
            days={days}
            disabled={busy}
            W={W}
            onDay={(d) => setDraft({ ...draft, ...d })}
          />
          <span className="cl-prof-name-acts">
            {left < 60 && <span className="cl-prof-aut-hint">{W.left(left)}</span>}
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy || !draft.text.trim() || (draft.picking && !draft.day)}
              onClick={() => void acts.add()}
              data-testid="person-notes-save"
            >
              {/* It says what pressing it makes: a note, or a step and its day (the motion grammar's label). */}
              {draft.day ? W.addStepFor(stepDayName(draft.day, Date.now(), pageClock().zone())) : W.add}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

/** The receptionist's suggestions, each with Keep and Dismiss for someone who may act. */
function suggestions(c: Card, waiting: Note[], acts: Acts) {
  const W = NOTE_WORDS;
  return (
    <ul className="cl-prof-note-list">
      {waiting.map((n) => (
        <li key={n.id} className="cl-pnote is-suggested" data-testid="person-note-suggested">
          <div className="cl-prof-note-meta">
            <span className="cl-prof-note-who">
              <Icon name="sparkle" size={10} /> {W.suggested}
            </span>
            {n.from && <span>{n.from}</span>}
            <span title={n.whenFull}>{n.when}</span>
          </div>
          <div className="cl-prof-note-body">{n.body}</div>
          {c.canEdit && (
            <div className="cl-prof-note-decide">
              <button
                type="button"
                className="btn btn-sm"
                disabled={c.busy}
                onClick={() => void acts.decide(n, true)}
                data-testid="person-note-keep"
              >
                {W.keep}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={c.busy}
                onClick={() => void acts.decide(n, false)}
                data-testid="person-note-dismiss"
              >
                {W.dismiss}
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A person's notes: the composer, the receptionist's suggestions, then the kept ones, three and the rest behind one press. */
export function PersonNotes({
  p,
  canEdit,
  isOwner,
  flash,
  onChanged,
}: {
  p: PersonVM;
  canEdit: boolean;
  isOwner: boolean;
  flash: FlashFn;
  onChanged: () => void;
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
