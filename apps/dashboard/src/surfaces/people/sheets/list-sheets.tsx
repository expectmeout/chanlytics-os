/**
 * Add a person on a phone, and the open list's own acts from the more-menu (moved whole from legacy/pages/people.jsx,
 * decision 0015). Add a person: the two fields stacked, 16px, a number pad for the number, one wide button; the
 * desktop's form stands inline in its controls row. The open list's acts -- rename it, delete it, or keep what is shown
 * as a list -- a desktop does on the list's title line, which a phone does not draw; the doors are the desktop's.
 */
import { FieldError } from "../../kit/field-error/field-error";
import { Confirm } from "../../kit/confirm/confirm";
import type { ListRule } from "@chanlytics/contracts";
import { RuleEditor } from "../lists/rule-editor";
import { SaveModes } from "../lists/save-shown";
import type { Flash, SavedList } from "../types";
import type { AddDraft, ListDraft } from "../words";
import { PhoneSheet } from "./phone-sheet";

export function PeopleAddSheet({
  draft,
  onDraft,
  onAdd,
  onClose,
}: {
  draft: AddDraft;
  onDraft: (patch: Partial<AddDraft>) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <PhoneSheet title="Add a person" onClose={onClose} testid="add-person-sheet">
      <label className="pp-field">
        <span className="pp-field-label">
          Name <span className="pp-field-opt">(optional)</span>
        </span>
        <input
          className="pp-input"
          autoFocus
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
    </PhoneSheet>
  );
}

export function PeopleListActSheet({
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
  act: string;
  list: SavedList | null;
  count: number;
  draft: ListDraft;
  onDraft: (patch: Partial<ListDraft>) => void;
  onGo: () => void;
  onClose: () => void;
  rule?: ListRule | null;
  flash?: Flash;
}) {
  if (act === "rule") {
    return (
      <PhoneSheet title="Who is on it" onClose={onClose} closeLabel={null} testid="list-act-sheet">
        <RuleEditor list={list as SavedList} flash={flash} onDone={onClose} />
      </PhoneSheet>
    );
  }
  if (act === "delete") {
    return (
      <PhoneSheet title="Delete the list" onClose={onClose} closeLabel={null} testid="list-act-sheet">
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
      </PhoneSheet>
    );
  }
  const renaming = act === "rename";
  return (
    <PhoneSheet
      title={renaming ? "Rename the list" : count ? `Save these ${count} as a list` : "Keep this list as yours"}
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
          autoFocus
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
    </PhoneSheet>
  );
}
