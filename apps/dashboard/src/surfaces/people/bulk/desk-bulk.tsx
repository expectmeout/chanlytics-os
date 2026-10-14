/**
 * The bulk bar on a desk (moved from legacy/pages/people.jsx PeopleBulkBar, decision 0015): the count, the page's own act
 * first (`lead`: the Pipeline's Mark as passed), then what a selection can become -- people on a list, a yes on record or
 * a receptionist mode (one menu, Messages: messages.ts), a note, a file -- each drawn where the role allows and says why
 * when it does not.
 */
import { editorBox, focusAsDrawn, gateTitle } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { addToListMenu as addMenu, barMenu } from "./bar-menu";
import type { BulkActs } from "./bulk-acts";
import type { BulkCtx } from "./bulk-state";
import { messagesChoices } from "./messages";

/**
 * The two inline boxes a desk's acts ask their words in: a new list's name, and which forms were signed. A note is the
 * note sheet's (step-sheet.tsx).
 */
function namingBox(b: BulkCtx, a: BulkActs) {
  const { st, canEdit } = b;
  const { busy, naming, setNaming, name, setName } = st;
  return (
    canEdit &&
    naming && (
      <span className="cl-bulk-naming" {...editorBox}>
        <input
          autoFocus={focusAsDrawn()}
          value={name}
          placeholder="Name the list"
          maxLength={60}
          disabled={busy}
          data-testid="bulk-list-name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void a.createAndAdd();
            if (e.key === "Escape") {
              setNaming(false);
              setName("");
            }
          }}
        />
        <button className="btn btn-sm btn-primary" disabled={busy || !name.trim()} onClick={a.createAndAdd}>
          Make it
        </button>
      </span>
    )
  );
}

function slipsBox(b: BulkCtx, a: BulkActs) {
  const { st, canEdit } = b;
  const { busy, slips, slipsNote, setSlipsNote } = st;
  return (
    canEdit &&
    slips && (
      <span className="cl-bulk-naming" {...editorBox}>
        <input
          autoFocus={focusAsDrawn()}
          value={slipsNote}
          placeholder="Which slips, e.g. Saturday's"
          maxLength={200}
          disabled={busy}
          aria-label="Which forms they signed"
          data-testid="bulk-form-note"
          onChange={(e) => setSlipsNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void a.recordSlips();
            if (e.key === "Escape") a.closeSlips();
          }}
        />
        <button
          className="btn btn-sm btn-primary"
          disabled={busy || !slipsNote.trim()}
          onClick={a.recordSlips}
          data-testid="bulk-form-save"
        >
          Record
        </button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={a.closeSlips}>
          Cancel
        </button>
      </span>
    )
  );
}

/** The menu of the lists kept by hand, and a new one. */
function addToListMenu(b: BulkCtx, a: BulkActs) {
  const { st, canEdit, keeps } = b;
  return canEdit && keeps("lists") && !st.naming && addMenu(b, a, () => st.setNaming(true), "sm");
}

/**
 * Messages: a yes on record -- which yes, and how it was given, the two separate answers -- and the receptionist's mode,
 * one menu of the three sets (messages.ts), each under its heading. A yes on sign-up forms asks which forms in its box.
 */
function messagesMenu(b: BulkCtx, a: BulkActs) {
  const { st } = b;
  const groups = messagesChoices(b, { yes: a.yesBy, mode: (m) => void a.receptionist(m) });
  return (
    groups.length > 0 &&
    !st.slips &&
    barMenu({
      words: "Messages",
      hover: "A yes on record, and what the receptionist does for these people",
      busy: st.busy,
      size: "sm",
      groups: groups.map((g) => ({
        header: `${g.header}…`,
        items: g.items.map((i) => ({ label: i.label, glyph: <Icon name={i.icon} size={13} />, onSelect: i.onSelect })),
      })),
      testid: "bulk-messages",
    })
  );
}

export function deskBulk(b: BulkCtx, a: BulkActs) {
  const { st, ids, lead, canEdit, canExport, activeSaved, keeps, onClear } = b;
  const { busy, naming } = st;
  return (
    <div className="cl-bulk" role="toolbar" aria-label="Selected people" data-testid="bulk-bar">
      <span className="cl-bulk-count">
        <b>{ids.length}</b> selected
      </span>
      {lead}
      {addToListMenu(b, a)}
      {namingBox(b, a)}
      {/* With a list kept by hand open, the selection can leave it; the people stay. The rows leave the view, so the bar closes with them.
          A smart list's rule says who is on it: nobody is taken off one by hand. */}
      {canEdit && activeSaved && activeSaved.byHand && !naming && (
        <button className="btn btn-sm" disabled={busy} onClick={a.dropFromList} data-testid="bulk-drop-list">
          <Icon name="x" size={11} /> Take off {activeSaved.name}
        </button>
      )}
      {messagesMenu(b, a)}
      {slipsBox(b, a)}
      {canEdit && keeps("note") && (
        <button className="btn btn-sm" disabled={busy} onClick={a.addNote} data-testid="bulk-note">
          <Icon name="edit" size={12} /> Add a note
        </button>
      )}
      {canExport && keeps("export") && (
        <button className="btn btn-sm" disabled={busy} onClick={a.exportCsv} data-testid="bulk-export">
          <Icon name="external" size={12} /> Export CSV
        </button>
      )}
      {!canEdit && (
        <span className="cl-prof-aut-hint">
          {keeps("consent")
            ? "Only an owner or operator can add to lists or record a yes."
            : gateTitle("approve", "add people to a list")}
        </span>
      )}
      <button className="btn btn-ghost btn-sm" onClick={onClear} data-testid="bulk-clear">
        <Icon name="x" size={11} /> Clear
      </button>
    </div>
  );
}
