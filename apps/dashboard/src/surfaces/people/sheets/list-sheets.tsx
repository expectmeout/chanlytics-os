/**
 * The open list's own acts on a phone (moved whole from legacy/pages/people.jsx, decision 0015), opened from the foot of
 * the Lists sheet (screen.tsx): rename it, delete it, or keep what is shown as a list, which a desktop does on the list's
 * title line, a phone not drawing one; the doors are the desktop's. Adding people is the page's sheet (import-sheet.tsx).
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
import type { ListDraft } from "../words";
import { JOB_CANCEL } from "./phone-sheet";

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
