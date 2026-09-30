/**
 * Somebody the business meets before they ever write or call: a number and, if known, a name, through the door the
 * calendar sweep already uses (moved whole from legacy/pages/people.jsx, decision 0015). The route existed for a year
 * with no screen calling it. An existing number opens that person rather than making a second one.
 */
import { useState } from "react";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { plAddPerson, plAddedWords } from "../lists/doors";
import type { Flash } from "../types";

export function AddPersonButton({ onAdded, flash }: { onAdded: (id: string) => void; flash: Flash }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setOpen(false);
    setName("");
    setPhone("");
    setError(null);
  };
  const submit = async () => {
    if (busy || !phone.trim()) return;
    setBusy(true);
    setError(null);
    const r = await plAddPerson({ name, phone });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    flash({ msg: plAddedWords({ name, phone }, r.existed) });
    close();
    onAdded(r.id);
  };
  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} data-testid="add-person">
        <Icon name="plus" size={12} /> Add a person
      </button>
    );
  }
  return (
    <span className="cl-bulk-naming" data-testid="add-person-form">
      <input
        autoFocus
        value={name}
        placeholder="Name (optional)"
        maxLength={80}
        disabled={busy}
        data-testid="add-person-name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
      />
      <input
        value={phone}
        placeholder="Mobile number"
        maxLength={24}
        disabled={busy}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "add-person-error" : undefined}
        data-testid="add-person-phone"
        onChange={(e) => setPhone(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") close();
        }}
      />
      <button
        className="btn btn-sm btn-primary"
        disabled={busy || !phone.trim()}
        onClick={submit}
        data-testid="add-person-save"
      >
        Add
      </button>
      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={close}>
        Cancel
      </button>
      <FieldError id="add-person-error" message={error} testid="add-person-error" />
    </span>
  );
}
