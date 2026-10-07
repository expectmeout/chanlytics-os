/**
 * Everyone shown, kept as a list by hand -- a filter frozen into something a broadcast can reach later (moved whole from
 * legacy/pages/people.jsx, decision 0015). A view with a rule behind it -- one of People's lists, a smart list, Needs you
 * -- is kept as a list that keeps itself current by default (decision 0009): with one of People's open, that is the copy
 * an owner then changes. "Just these" freezes who is shown today, as a view no rule says (a search, a list kept by hand)
 * always does.
 */
import { useState } from "react";
import type { ListRule } from "@chanlytics/contracts";
import { refusalToast } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import type { Flash } from "../types";
import { plMakeListWith, plMakeRuleList, plRuleMadeWords, plUndoList } from "./doors";

export function SaveModes({
  mode,
  onMode,
  count,
  disabled,
}: {
  mode: string;
  onMode: (mode: string) => void;
  count: number;
  disabled: boolean;
}) {
  return (
    <span className="cl-save-mode" role="radiogroup" aria-label="What the list keeps">
      <button
        type="button"
        role="radio"
        aria-checked={mode === "rule"}
        className={`cl-bucket-link${mode === "rule" ? " is-on" : ""}`}
        disabled={disabled}
        onClick={() => onMode("rule")}
        data-testid="save-shown-rule"
      >
        Keeps itself current
      </button>
      {" · "}
      <button
        type="button"
        role="radio"
        aria-checked={mode === "people"}
        className={`cl-bucket-link${mode === "people" ? " is-on" : ""}`}
        disabled={disabled}
        onClick={() => onMode("people")}
        data-testid="save-shown-people"
      >
        Just these {count}
      </button>
    </span>
  );
}

export function SaveShownAsList({
  ids,
  suggested,
  rule = null,
  flash,
  onMade = () => undefined,
}: {
  ids: string[];
  suggested: string;
  rule?: ListRule | null;
  flash: Flash;
  onMade?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("rule");
  const keepsRule = !!rule && (mode === "rule" || ids.length === 0);
  const submit = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    if (rule && keepsRule) {
      const r = await plMakeRuleList(n, rule);
      setBusy(false);
      if (!r.ok) {
        flash({ tone: "danger", msg: <>{r.error}</> });
        return;
      }
      setOpen(false);
      setName("");
      flash({ msg: plRuleMadeWords(n) });
      if (r.id) onMade(r.id);
      return;
    }
    const made = await plMakeListWith(n, ids);
    if (!made.ok) {
      setBusy(false);
      flash({ tone: "danger", msg: <>{made.message || "Could not make the list."}</> });
      return;
    }
    const { filled, id } = made;
    setBusy(false);
    setOpen(false);
    setName("");
    flash(
      filled.ok
        ? {
            msg: (
              <>
                {ids.length} kept as <b>{n}</b>
              </>
            ),
            undo: () => plUndoList(id, n, flash),
          }
        : refusalToast(filled, "Not kept as a list"),
    );
  };
  if (!open) {
    return (
      <button
        className="cl-bucket-link"
        onClick={() => {
          setName(suggested || "");
          setMode("rule");
          setOpen(true);
        }}
        data-testid="save-shown"
      >
        {ids.length ? `Save these ${ids.length} as a list` : "Keep this list as yours"}{" "}
        <Icon name="arrow-right" size={10} />
      </button>
    );
  }
  return (
    <span className={`cl-bulk-naming${rule && ids.length > 0 ? " has-modes" : ""}`}>
      {rule && ids.length > 0 && <SaveModes mode={mode} onMode={setMode} count={ids.length} disabled={busy} />}
      <input
        autoFocus
        value={name}
        placeholder="Name the list"
        maxLength={60}
        disabled={busy}
        data-testid="save-shown-name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <button
        className="btn btn-sm btn-primary"
        disabled={busy || !name.trim()}
        onClick={submit}
        data-testid="save-shown-save"
      >
        Keep it
      </button>
      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </span>
  );
}
