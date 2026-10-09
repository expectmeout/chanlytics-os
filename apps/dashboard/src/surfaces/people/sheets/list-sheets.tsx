/**
 * Add a person on a phone, and the open list's own acts from the more-menu (moved whole from legacy/pages/people.jsx,
 * decision 0015). Add a person: the two fields stacked, 16px, a number pad for the number, one wide button; the
 * desktop's form stands inline in its controls row. The open list's acts -- rename it, delete it, or keep what is shown
 * as a list -- a desktop does on the list's title line, which a phone does not draw; the doors are the desktop's.
 * Each is the kit's Sheet in a job's shape (kit/sheet/sheet.tsx), drawn while the page says it is `open`, so it leaves
 * the way it came; Escape, its wash and a pull down close it as its word does.
 */
import { FieldError } from "../../kit/field-error/field-error";
import { Confirm } from "../../kit/confirm/confirm";
import { Sheet } from "../../kit/sheet/sheet";
import { focusAsDrawn } from "../../legacy-verbs";
import type { ListRule } from "@chanlytics/contracts";
import { RuleEditor } from "../lists/rule-editor";
import { SaveModes } from "../lists/save-shown";
import type { Flash, SavedList } from "../types";
import type { AddDraft, ListDraft } from "../words";
import { JOB_CANCEL } from "./phone-sheet";

export function PeopleAddSheet({
  open,
  draft,
  onDraft,
  onAdd,
  onClose,
}: {
  open: boolean;
  draft: AddDraft;
  onDraft: (patch: Partial<AddDraft>) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} shape="job" title="Add a person" close={JOB_CANCEL} onClose={onClose} testid="add-person-sheet">
      <label className="pp-field">
        <span className="pp-field-label">
          Name <span className="pp-field-opt">(optional)</span>
        </span>
        <input
          className="pp-input"
          autoFocus={focusAsDrawn()}
          value={draft.name}
          maxLength={80}
          autoComplete="name"
          disabled={draft.busy}
          onChange={(e) => onDraft({ name: e.target.value })}
          data-testid="add-person-name"
        />
      </label>
      <label className="pp-field">
        <span className="pp-field-label">Mobile number</span>
        <input
          className="pp-input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={draft.phone}
          maxLength={24}
          disabled={draft.busy}
          aria-invalid={draft.error ? true : undefined}
          aria-describedby={draft.error ? "add-person-error" : undefined}
          onChange={(e) => onDraft({ phone: e.target.value, error: null })}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAdd();
          }}
          data-testid="add-person-phone"
        />
      </label>
      <FieldError id="add-person-error" message={draft.error} testid="add-person-error" />
      <p className="pp-sheet-hint">A number that is already here opens that person instead of adding them twice.</p>
      <button
        type="button"
        className="btn btn-primary pp-sheet-go"
        disabled={draft.busy || !draft.phone.trim()}
        onClick={onAdd}
        data-testid="add-person-save"
      >
        {draft.busy ? "Adding…" : "Add"}
      </button>
    </Sheet>
  );
}

export function PeopleListActSheet({
  open,
  act,
  list,
  count,
  draft,
  onDraft,
  onGo,
  onClose,
  rule = null,
  flash = () => undefined,
}: {
  open: boolean;
  act: string | null;
  list: SavedList | null;
  count: number;
  draft: ListDraft;
  onDraft: (patch: Partial<ListDraft>) => void;
  onGo: () => void;
  onClose: () => void;
  rule?: ListRule | null;
  flash?: Flash;
}) {
  // Its own button is the way out of these two: no word in the head.
  if (act === "rule") {
    return (
      <Sheet open={open} shape="job" title="Who is on it" close={null} onClose={onClose} testid="list-act-sheet">
        <RuleEditor list={list as SavedList} flash={flash} onDone={onClose} />
      </Sheet>
    );
  }
  if (act === "delete") {
    return (
      <Sheet open={open} shape="job" title="Delete the list" close={null} onClose={onClose} testid="list-act-sheet">
        <Confirm
          block
          question={`Delete “${(list as SavedList).name}”?`}
          detail="The people stay."
          yes="Yes, delete"
          danger
          busy={draft.busy}
          error={draft.error}
          onYes={onGo}
          onNo={onClose}
          testid="delete-list"
        />
      </Sheet>
    );
  }
  const renaming = act === "rename";
  return (
    <Sheet
      open={open}
      shape="job"
      title={renaming ? "Rename the list" : count ? `Save these ${count} as a list` : "Keep this list as yours"}
      close={JOB_CANCEL}
      onClose={onClose}
      testid="list-act-sheet"
    >
      {!renaming && rule && count > 0 && (
        <SaveModes
          mode={draft.mode || "rule"}
          onMode={(m) => onDraft({ mode: m })}
          count={count}
          disabled={draft.busy}
        />
      )}
      <label className="pp-field">
        <span className="pp-field-label">{renaming ? "Its name" : "Name the list"}</span>
        <input
          className="pp-input"
          autoFocus={focusAsDrawn()}
          value={draft.name}
          maxLength={60}
          disabled={draft.busy}
          aria-invalid={draft.error ? true : undefined}
          aria-describedby={draft.error ? "list-act-error" : undefined}
          onChange={(e) => onDraft({ name: e.target.value, error: null })}
          onKeyDown={(e) => {
            if (e.key === "Enter") onGo();
          }}
          data-testid={renaming ? "list-rename-name" : "save-shown-name"}
        />
      </label>
      <FieldError id="list-act-error" message={draft.error} testid="list-act-error" />
      <button
        type="button"
        className="btn btn-primary pp-sheet-go"
        disabled={draft.busy || !draft.name.trim()}
        onClick={onGo}
        data-testid={renaming ? "list-rename-save" : "save-shown-save"}
      >
        {draft.busy ? "Saving…" : renaming ? "Save" : "Keep it"}
      </button>
    </Sheet>
  );
}
