/**
 * A list kept by hand, named on the rail (moved whole from legacy/pages/people.jsx, decision 0015). The name is the only
 * thing typed here; people join from their profile. The POST answers before the rail re-reads the surface, so the new
 * row is the server's. `openSignal` opens the box from outside: the shell's and a profile's "New list" (segments:new).
 * A new list: a name kept by hand, or -- "Describe who" -- a smart list whose rule the assistant drafts from the owner's
 * own words and the page shows back as chips with who it holds for today, before anything is saved.
 */
import { useEffect, useState } from "react";
import type { ListRule } from "@chanlytics/contracts";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { lists } from "../people-lists";
import type { ApiResult } from "@/client/api";

/** A smart list drafted from words: a name, a rule and what it could not say. */
export interface ListDraftOf {
  name: string;
  rule: ListRule;
  cannot: string | null;
}

export function NewListRow({
  onCreate,
  openSignal = 0,
}: {
  onCreate: (name: string, rule: ListRule | null) => Promise<ApiResult<unknown>>;
  openSignal?: number;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smart, setSmart] = useState(false);
  const [words, setWords] = useState("");
  const [draft, setDraft] = useState<ListDraftOf | null>(null);
  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);
  const close = () => {
    setOpen(false);
    setName("");
    setError(null);
    setSmart(false);
    setWords("");
    setDraft(null);
  };
  const submit = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    setError(null);
    const r = await onCreate(n, draft ? draft.rule : null);
    setBusy(false);
    if (!r.ok) {
      setError(r.message || "Could not make the list.");
      return;
    }
    close();
  };
  const build = async () => {
    const w = words.trim();
    if (!w || busy) return;
    setBusy(true);
    setError(null);
    const r = await lists.draft(w);
    setBusy(false);
    if (!r.ok) {
      setError(r.message || "Could not draft the list.");
      return;
    }
    setDraft(r.data);
    setName(r.data.name);
  };
  if (!open) {
    return (
      <div className="cl-rail-foot">
        <button className="cl-rail-newseg" onClick={() => setOpen(true)} data-testid="new-list">
          <Icon name="plus" size={11} />
          New list
        </button>
      </div>
    );
  }
  if (smart && !draft) return describeBox({ words, setWords, busy, error, build, close, setSmart, setError });
  return nameBox({ draft, name, setName, busy, error, submit, close, setDraft, setSmart, setError });
}

/** The box that takes who the list is, in words: the assistant drafts the rule from them. */
function describeBox(p: {
  words: string;
  setWords: (w: string) => void;
  busy: boolean;
  error: string | null;
  build: () => Promise<void>;
  close: () => void;
  setSmart: (on: boolean) => void;
  setError: (e: string | null) => void;
}) {
  const { words, setWords, busy, error, build, close, setSmart, setError } = p;
  return (
    <div className="cl-rail-foot">
      <div className="cl-rail-newlist">
        <input
          autoFocus
          value={words}
          placeholder="Describe who — “haven’t visited in two months”"
          maxLength={300}
          disabled={busy}
          aria-label="Describe who is on the list"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "new-list-error" : undefined}
          data-testid="new-list-words"
          onChange={(e) => setWords(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void build();
            if (e.key === "Escape") close();
          }}
        />
        <button
          className="btn btn-sm btn-primary"
          disabled={busy || !words.trim()}
          onClick={build}
          data-testid="new-list-build"
        >
          {busy ? "Building…" : "Build"}
        </button>
      </div>
      <FieldError id="new-list-error" message={error} testid="new-list-error" />
      <button
        type="button"
        className="cl-bucket-link cl-rail-newlist-mode"
        onClick={() => {
          setSmart(false);
          setError(null);
        }}
        data-testid="new-list-hand"
      >
        Keep one by hand instead
      </button>
    </div>
  );
}

/** The box that takes the list's name, over the rule the assistant drafted, if it drafted one. */
function nameBox(p: {
  draft: ListDraftOf | null;
  name: string;
  setName: (n: string) => void;
  busy: boolean;
  error: string | null;
  submit: () => Promise<void>;
  close: () => void;
  setDraft: (d: ListDraftOf | null) => void;
  setSmart: (on: boolean) => void;
  setError: (e: string | null) => void;
}) {
  const { draft, name, setName, busy, error, submit, close, setDraft, setSmart, setError } = p;
  // Who a drafted rule holds for today, over the people the page has read (contracts listMembers, via the courier).
  const holds = draft ? lists.count(draft.rule) : null;
  return (
    <div className="cl-rail-foot">
      {draft && (
        <div className="cl-rail-draft" data-testid="new-list-draft">
          <div className="cl-tag-stack">
            {lists.parts(draft.rule).map((part) => (
              <span key={part} className="chip chip-wrap" data-testid="new-list-rule">
                {part}
              </span>
            ))}
          </div>
          {holds !== null && (
            <div className="cl-rail-hint" data-testid="new-list-holds">
              {holds === 1 ? "1 person" : `${holds} people`} on it today, and it keeps itself current.
            </div>
          )}
          {draft.cannot && (
            <div className="cl-rail-hint" data-testid="new-list-cannot">
              Left out: {draft.cannot}
            </div>
          )}
        </div>
      )}
      <div className="cl-rail-newlist">
        <input
          autoFocus
          value={name}
          placeholder="Name the list"
          maxLength={60}
          disabled={busy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "new-list-error" : undefined}
          data-testid="new-list-name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") close();
          }}
        />
        <button
          className="btn btn-sm btn-primary"
          disabled={busy || !name.trim()}
          onClick={submit}
          data-testid="new-list-add"
        >
          {draft ? "Save" : "Add"}
        </button>
      </div>
      <FieldError id="new-list-error" message={error} testid="new-list-error" />
      {draft ? (
        <button
          type="button"
          className="cl-bucket-link cl-rail-newlist-mode"
          onClick={() => {
            setDraft(null);
            setError(null);
          }}
          data-testid="new-list-redescribe"
        >
          Describe it again
        </button>
      ) : (
        <button
          type="button"
          className="cl-bucket-link cl-rail-newlist-mode"
          onClick={() => {
            setSmart(true);
            setError(null);
          }}
          data-testid="new-list-smart"
        >
          Or describe who, and it keeps itself current
        </button>
      )}
    </div>
  );
}
