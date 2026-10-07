/**
 * The person's name and email address, each changed where it is said (moved from legacy/pages/client-profile.jsx,
 * decision 0015, step 5).
 *
 * The name as the owner gives it. A number is what most people arrive as, so for a person with no name yet the control is
 * the invitation ("Name them"), always visible; a person who has a name shows a quiet pencil beside it. The pencil used to
 * show on hover alone, which a phone never has. Enter saves, Escape leaves.
 *
 * The email address sits in the About list where the number is: said once, and changed where it is said. Someone who may
 * change it sees the address with a quiet pencil, or "Add an email" when there is none; someone who may not sees the
 * address, or no row at all. What is wrong with a typed address is said under the field before a round trip
 * (whyNotAnEmail), and the door's own refusal, another person here already has it, is said there too.
 */
import { useEffect, useState } from "react";
import { whyNotAnEmail } from "@chanlytics/contracts";
import type { PersonVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { setPersonDetails } from "../people-detail";
import type { FlashFn } from "../person-verbs";

interface FieldProps {
  p: PersonVM;
  canEdit: boolean;
  flash: FlashFn;
}

/** The name, with the pencil that changes it. */
export function PersonName({ p, canEdit, flash }: FieldProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const open = () => {
    setValue(p.givenName || "");
    setEditing(true);
  };
  const save = async () => {
    if (busy) return;
    const next = value.trim();
    if (next === (p.givenName || "")) {
      setEditing(false);
      return;
    }
    setBusy(true);
    const r = await setPersonDetails(p.id, { name: next });
    setBusy(false);
    if (!r.ok) {
      flash({ tone: "danger", msg: <>{r.message || "Could not save the name."}</> });
      return;
    }
    setEditing(false);
    flash({
      msg: next ? (
        <>
          Named <b>{next}</b>
        </>
      ) : (
        <>Name cleared — {p.phone ? "the number" : p.email ? "their email address" : "nothing"} shows again</>
      ),
    });
  };
  if (!editing) {
    const unnamed = !p.givenName;
    return (
      <div className="cl-prof-name-row">
        <h1 className="cl-prof-name">{p.name}</h1>
        {canEdit && (
          <button
            type="button"
            className={`cl-prof-rename ${unnamed ? "is-plain" : ""}`}
            title={unnamed ? "Give them a name" : "Rename"}
            aria-label={unnamed ? "Give them a name" : "Rename"}
            onClick={open}
            data-testid="person-rename"
          >
            <Icon name="edit" size={11} />
            {unnamed && <span className="cl-prof-rename-word">Name them</span>}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="cl-prof-name-row editing">
      <input
        className="cl-prof-name-input"
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the pencil was pressed to type here: focus follows it
        autoFocus
        value={value}
        placeholder="Their name"
        maxLength={80}
        disabled={busy}
        aria-label="Their name"
        data-testid="person-name-input"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <span className="cl-prof-name-acts">
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={busy}
          onClick={() => void save()}
          data-testid="person-name-save"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </span>
    </div>
  );
}

/** The email address, in the About list, with the pencil that changes it. */
export function PersonEmail({ p, canEdit, flash }: FieldProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    setEditing(false);
    setProblem(null);
  }, [p.id, p.email]);
  const open = () => {
    setValue(p.email || "");
    setProblem(null);
    setEditing(true);
  };
  const save = async () => {
    if (busy) return;
    const next = value.trim();
    if (next.toLowerCase() === (p.email || "")) {
      setEditing(false);
      return;
    }
    const why = next ? whyNotAnEmail(next) : null;
    if (why) {
      setProblem(why);
      return;
    }
    setBusy(true);
    const r = await setPersonDetails(p.id, { email: next });
    setBusy(false);
    if (!r.ok) {
      setProblem(r.message || "Could not save the address.");
      return;
    }
    setEditing(false);
    flash({ msg: next ? <>Email address saved</> : <>Email address removed</> });
  };
  if (!editing) {
    return (
      <span className="cl-prof-email" data-testid="person-email">
        {p.email && <span className="cl-prof-email-val">{p.email}</span>}
        {canEdit && (
          <button
            type="button"
            className={`cl-prof-rename ${p.email ? "" : "is-plain"}`}
            title={p.email ? "Change the email address" : "Add an email address"}
            aria-label={p.email ? "Change the email address" : "Add an email address"}
            onClick={open}
            data-testid="person-email-edit"
          >
            <Icon name="edit" size={11} />
            {!p.email && <span className="cl-prof-rename-word">Add an email</span>}
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="cl-prof-email editing" data-testid="person-email">
      <input
        className="cl-prof-email-input"
        type="email"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the pencil was pressed to type here: focus follows it
        autoFocus
        value={value}
        placeholder="name@example.com"
        maxLength={254}
        disabled={busy}
        aria-label="Their email address"
        aria-invalid={problem ? "true" : undefined}
        data-testid="person-email-input"
        onChange={(e) => {
          setValue(e.target.value);
          setProblem(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
      {problem && (
        <span className="cl-prof-email-problem" role="alert" data-testid="person-email-problem">
          {problem}
        </span>
      )}
      <span className="cl-prof-name-acts">
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={busy}
          onClick={() => void save()}
          data-testid="person-email-save"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </span>
    </span>
  );
}
