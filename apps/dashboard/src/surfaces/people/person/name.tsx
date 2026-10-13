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
import { useEffect, useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { PERSON_NAME_WORDS, PERSON_WASH_WORDS, whyNotAnEmail } from "@chanlytics/contracts";
import type { PersonVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { RecordBox } from "../../kit/record/field";
import { Wash } from "../../kit/motion/wash";
import { LinkButton } from "../../kit/link-button/link-button";
import { editorBox, focusAsDrawn } from "../../legacy-verbs";
import { setPersonDetails } from "../people-detail";
import type { FlashFn } from "../person-verbs";

interface FieldProps {
  p: PersonVM;
  canEdit: boolean;
  flash: FlashFn;
}

/**
 * The name, with the pencil that changes it. A stand-in (named for the business, 0052) is offered "Add their name", and
 * its field opens empty: the business's name is not theirs. A name a reply's signer gave says so in the field, with the
 * way back to the business (`onPutBack`, the notice's Undo).
 */
export function PersonName({ p, canEdit, flash, onPutBack }: FieldProps & { onPutBack?: (() => void) | null }) {
  const boxId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const open = () => {
    setValue(p.standIn ? "" : p.givenName || "");
    setEditing(true);
  };
  const save = async () => {
    if (busy) return;
    const next = value.trim();
    // A stand-in's field left empty keeps the business's name: an empty save would clear it.
    if (next === (p.givenName || "") || (p.standIn && !next)) {
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
    const unnamed = !p.givenName || p.standIn;
    const word = p.standIn ? (p.head.addName ? PERSON_NAME_WORDS.addName : null) : unnamed ? "Name them" : null;
    return (
      <div className="cl-prof-name-row">
        <h1 className="cl-prof-name">
          <Wash scope={p.id} value={p.name} said={PERSON_WASH_WORDS.name(p.name)}>
            {p.name}
          </Wash>
        </h1>
        {canEdit && (
          <button
            type="button"
            className={`cl-prof-rename ${word ? "is-plain" : ""}`}
            title={unnamed ? "Give them a name" : "Rename"}
            aria-label={unnamed ? "Give them a name" : "Rename"}
            onClick={open}
            data-testid="person-rename"
          >
            <Icon name="edit" size={11} />
            {word && <span className="cl-prof-rename-word">{word}</span>}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="cl-prof-name-row editing" {...editorBox}>
      {/* The name's own box at the name's size, ✓ and ✕ beside it (canvas A, M1): Enter saves, Escape puts it back. */}
      <RecordBox
        id={boxId}
        label="Their name"
        className="cl-prof-name-box"
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the pencil was pressed to type here: focus follows it under a mouse
        autoFocus={focusAsDrawn()}
        value={value}
        placeholder="Their name"
        maxLength={80}
        readOnly={busy}
        data-testid="person-name-input"
        onChange={setValue}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <span className="cl-prof-name-acts">
        <Button
          variant="quiet"
          size="sm"
          iconOnly
          className="cl-prof-name-ok"
          aria-label={busy ? "Saving…" : "Save"}
          title="Save"
          aria-busy={busy || undefined}
          onClick={() => void save()}
          data-testid="person-name-save"
        >
          <Icon name="check" size={13} />
        </Button>
        <Button
          variant="quiet"
          size="sm"
          iconOnly
          aria-label="Cancel"
          title="Cancel"
          onClick={() => setEditing(false)}
          data-testid="person-name-cancel"
        >
          <Icon name="x" size={13} />
        </Button>
      </span>
      {p.head.namedBy && onPutBack ? (
        <p className="cl-prof-name-from" data-testid="person-name-from">
          {PERSON_NAME_WORDS.fromSignature(p.head.namedBy.day)}
          {p.head.namedBy.putBack ? (
            <>
              {" · "}
              <LinkButton
                onClick={() => {
                  setEditing(false);
                  onPutBack();
                }}
                data-testid="person-name-put-back"
              >
                {PERSON_NAME_WORDS.putBack(p.head.namedBy.putBack)}
              </LinkButton>
            </>
          ) : null}
        </p>
      ) : null}
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
    <span className="cl-prof-email editing" data-testid="person-email" {...editorBox}>
      <input
        className="cl-prof-email-input"
        type="email"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the pencil was pressed to type here: focus follows it under a mouse
        autoFocus={focusAsDrawn()}
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
