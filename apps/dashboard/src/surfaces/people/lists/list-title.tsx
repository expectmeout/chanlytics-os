/**
 * A list kept by hand is named where it is shown: the title turns into the box, Enter saves, Escape leaves (moved whole
 * from legacy/pages/people.jsx, decision 0015). Lists had a Rename button of its own; here the list IS the page's title
 * while it is open. Deleting one keeps the people; only the grouping goes: asked once, inline, in the words that say so.
 * A refusal keeps the question open and says why.
 */
import { useState } from "react";
import { FieldError } from "../../kit/field-error/field-error";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import type { SavedList } from "../types";
import { plDeleteList, plRenameList } from "./doors";
import type { DeleteAnswer } from "./doors";

export function DeleteListButton({ list, onDeleted }: { list: SavedList; onDeleted: (answer: DeleteAnswer) => void }) {
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await plDeleteList(list);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setArm(false);
    onDeleted(r);
  };
  if (!arm) {
    return (
      <button
        className="cl-bucket-link danger"
        style={{ marginLeft: 8 }}
        onClick={() => {
          setError(null);
          setArm(true);
        }}
        data-testid="delete-list"
      >
        Delete list…
      </button>
    );
  }
  return (
    <span style={{ marginLeft: 8 }}>
      <Confirm
        question={`Delete “${list.name}”?`}
        detail="The people stay."
        yes="Yes, delete"
        danger
        busy={busy}
        error={error}
        onYes={go}
        onNo={() => {
          setArm(false);
          setError(null);
        }}
        testid="delete-list"
      />
    </span>
  );
}

export function ListTitle({
  list,
  canEdit,
  onRenamed,
  onEditRule = null,
}: {
  list: SavedList;
  canEdit: boolean;
  onRenamed: (name: string) => void;
  onEditRule?: (() => void) | null;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const n = name.trim();
    if (!n || busy) return;
    if (n === list.name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    const r = await plRenameList(list, n);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setEditing(false);
    onRenamed(n);
  };
  if (!editing) {
    return (
      <span className="cl-section-title" data-testid="saved-filter">
        <Icon name={list.byHand ? "filter" : "sparkle"} size={12} />
        {list.name}
        {/* A smart list says its rule once, quietly, beside its name: who is on it and why. One it can't count says
            why instead (lists.ts listUnknownWords), never a 0. */}
        {list.rule && (
          <span className="cl-list-rule" data-testid="list-rule">
            {list.rule.join(" · ")}
          </span>
        )}
        {list.unknown && (
          <span className="cl-list-rule" data-testid="list-unknown">
            {list.unknown}
          </span>
        )}
        {canEdit && list.rule && onEditRule && (
          <button
            type="button"
            className="cl-bucket-link cl-list-rule-edit"
            onClick={onEditRule}
            data-testid="list-rule-edit"
          >
            Change who
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            className="cl-list-rename"
            title="Rename the list"
            aria-label="Rename the list"
            onClick={() => {
              setName(list.name);
              setError(null);
              setEditing(true);
            }}
            data-testid="list-rename"
          >
            <Icon name="edit" size={11} />
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="cl-bulk-naming cl-list-renaming" data-testid="saved-filter">
      <input
        autoFocus
        value={name}
        maxLength={60}
        disabled={busy}
        aria-label="The list's name"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "list-rename-error" : undefined}
        data-testid="list-rename-name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(false)}>
        Cancel
      </button>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        disabled={busy || !name.trim()}
        onClick={save}
        data-testid="list-rename-save"
      >
        {busy ? "Saving…" : "Save"}
      </button>
      <FieldError id="list-rename-error" message={error} testid="list-rename-error" />
    </span>
  );
}
