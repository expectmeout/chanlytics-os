/**
 * A list kept by hand is named where it is shown: the title is the box it is typed in, so renaming it moves nothing;
 * Enter, its ✓ or leaving it saves, Escape leaves it as it was (moved from legacy/pages/people.jsx, decision 0015).
 * Lists had a Rename button of its own; here the list IS the page's title while it is open. Deleting one keeps the
 * people; only the grouping goes: asked once, inline, in the words that say so. A refusal keeps the question open and
 * says why.
 */
import { useState } from "react";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { useInPlace } from "../../kit/record/in-place";
import { InPlacePen } from "../person/name";
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
  onRefused,
  onEditRule = null,
}: {
  list: SavedList;
  canEdit: boolean;
  onRenamed: (name: string) => void;
  /** The door's refusal of a name the box was left on, said by the page: the old name is back by then. */
  onRefused: (why: string) => void;
  onEditRule?: (() => void) | null;
}) {
  // The name is the box it is typed in (kit/record/in-place.ts): left empty, or as it was, the name stays.
  const edit = useInPlace({
    value: list.name,
    start: list.name,
    max: 60,
    same: (typed) => !typed || typed === list.name,
    save: async (name) => {
      const r = await plRenameList(list, name);
      if (!r.ok) return r.error;
      onRenamed(name);
      return null;
    },
    said: onRefused,
  });
  return (
    <span className="cl-section-title" data-testid="saved-filter">
      <Icon name={list.byHand ? "filter" : "sparkle"} size={12} />
      {canEdit ? (
        <span
          className="cl-list-naming"
          data-in-place
          data-typing={edit.typing || undefined}
          aria-busy={edit.busy || undefined}
        >
          <span
            key={edit.round}
            {...edit.box}
            className="cl-in-place"
            aria-label="The list's name"
            spellCheck={false}
            enterKeyHint="done"
            data-placeholder="The list's name"
            data-testid="list-rename-name"
          >
            {edit.shown}
          </span>
          <InPlacePen edit={edit} label="Rename the list" rest="list-rename" save="list-rename-save" />
          {edit.problem ? (
            <span className="cl-in-place-says" data-problem role="alert" data-testid="list-rename-error">
              {edit.problem}
            </span>
          ) : null}
        </span>
      ) : (
        list.name
      )}
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
    </span>
  );
}
