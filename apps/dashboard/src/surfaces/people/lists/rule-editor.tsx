/**
 * Who a smart list of the workspace's own is (decision 0009): its rule now, and a new one drafted from the owner's words
 * the way a new list's is (lists.draft), shown back as chips with who it holds for today before it is saved (moved whole
 * from legacy/pages/people.jsx, decision 0015). The desktop's title line opens it under the title; the phone's more-menu
 * opens it in a sheet, which is where a phone sees the rule at all.
 */
import { useState } from "react";
import { FieldError } from "../../kit/field-error/field-error";
import { lists } from "../people-lists";
import type { Flash, SavedList } from "../types";
import type { ListDraftOf } from "../rail/new-list";

export function RuleEditor({ list, flash, onDone }: { list: SavedList; flash: Flash; onDone: () => void }) {
  const [words, setWords] = useState("");
  const [draft, setDraft] = useState<ListDraftOf | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const build = async () => {
    const w = words.trim();
    if (!w || busy) return;
    setBusy(true);
    setError(null);
    const r = await lists.draft(w);
    setBusy(false);
    if (!r.ok) {
      setError(r.message || "Could not draft the rule.");
      return;
    }
    setDraft(r.data);
  };
  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    const r = await lists.setRule(list.id, draft.rule);
    setBusy(false);
    if (!r.ok) {
      setError(r.message || "Could not change who is on it.");
      return;
    }
    flash({
      msg: (
        <>
          Who is on <b>{list.name}</b> changed. It keeps itself current.
        </>
      ),
    });
    onDone();
  };
  // Who the new rule holds for today, over the people the page has read, as the New list box counts a draft.
  const holds = draft ? lists.count(draft.rule) : null;
  return (
    <div className="cl-rule-edit" data-testid="rule-edit">
      <div className="cl-rail-hint" data-testid="rule-edit-now">
        Now: {(list.rule || []).join(" · ")}
      </div>
      {draft ? (
        <div className="cl-rail-draft" data-testid="rule-edit-draft">
          <div className="cl-tag-stack">
            {lists.parts(draft.rule).map((part) => (
              <span key={part} className="chip chip-wrap" data-testid="rule-edit-rule">
                {part}
              </span>
            ))}
          </div>
          {holds !== null && (
            <div className="cl-rail-hint" data-testid="rule-edit-holds">
              {holds === 1 ? "1 person" : `${holds} people`} on it today with this rule.
            </div>
          )}
          {draft.cannot && <div className="cl-rail-hint">Left out: {draft.cannot}</div>}
        </div>
      ) : (
        <div className="cl-rail-newlist">
          <input
            autoFocus
            value={words}
            placeholder="Describe who — “on WhatsApp, and quiet a month”"
            maxLength={300}
            disabled={busy}
            aria-label="Describe who is on the list"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "rule-edit-error" : undefined}
            data-testid="rule-edit-words"
            onChange={(e) => setWords(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void build();
              if (e.key === "Escape") onDone();
            }}
          />
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={busy || !words.trim()}
            onClick={build}
            data-testid="rule-edit-build"
          >
            {busy ? "Building…" : "Build"}
          </button>
        </div>
      )}
      <FieldError id="rule-edit-error" message={error} testid="rule-edit-error" />
      <div className="cl-rule-edit-acts">
        {draft && (
          <button
            type="button"
            className="cl-bucket-link"
            disabled={busy}
            onClick={() => {
              setDraft(null);
              setError(null);
            }}
            data-testid="rule-edit-redescribe"
          >
            Describe it again
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={onDone}
          data-testid="rule-edit-cancel"
        >
          Cancel
        </button>
        {draft && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={busy}
            onClick={save}
            data-testid="rule-edit-save"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}
