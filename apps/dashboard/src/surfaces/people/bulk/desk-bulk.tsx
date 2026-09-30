/**
 * The bulk bar on a desk (moved from legacy/pages/people.jsx PeopleBulkBar, decision 0015): the count, the page's own act
 * first (`lead`: the Pipeline's Mark as passed), then what a selection can become -- people on a list, a yes on record,
 * a receptionist mode, a note, a file -- each drawn where the role allows and says why when it does not.
 */
import { gateTitle } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { PL_MODES, plModeWord } from "../words";
import type { BulkActs } from "./bulk-acts";
import type { BulkCtx } from "./bulk-state";

/** The three inline boxes a desk's acts ask their words in: a new list's name, which forms were signed, a note. */
function namingBox(b: BulkCtx, a: BulkActs) {
  const { st, canEdit } = b;
  const { busy, naming, setNaming, name, setName } = st;
  return (
    canEdit &&
    naming && (
      <span className="cl-bulk-naming">
        <input
          autoFocus
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
      <span className="cl-bulk-naming">
        <input
          autoFocus
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

function noteBox(b: BulkCtx, a: BulkActs) {
  const { st, canEdit } = b;
  const { busy, noting, setNoting, note, setNote } = st;
  return (
    canEdit &&
    noting && (
      <span className="cl-bulk-naming">
        <input
          autoFocus
          value={note}
          placeholder="One line, under their notes"
          maxLength={200}
          disabled={busy}
          data-testid="bulk-note-line"
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void a.addNote();
            if (e.key === "Escape") {
              setNoting(false);
              setNote("");
            }
          }}
        />
        <button className="btn btn-sm btn-primary" disabled={busy || !note.trim()} onClick={a.addNote}>
          Add
        </button>
      </span>
    )
  );
}

/** The menu of the lists kept by hand, and a new one. */
function addToListMenu(b: BulkCtx, a: BulkActs) {
  const { st, saved, savedRead, phone, canEdit, keeps } = b;
  const { busy, naming, setNaming } = st;
  return (
    canEdit &&
    keeps("lists") &&
    !naming && (
      <MoreMenu
        btnClass="btn btn-sm"
        escape={phone}
        label="Add to list"
        title="Add to a list"
        gated={busy ? "One moment — the last change is still saving" : null}
        items={
          savedRead
            ? [
                { header: "Add to" },
                ...saved
                  .filter((s) => s.byHand)
                  .map((s) => ({ label: s.name, icon: "filter", onClick: () => void a.addTo(s) })),
                { label: "New list…", icon: "plus", onClick: () => setNaming(true) },
              ]
            : [
                // Lists that could not be read are not offered; a new one can still be made.
                { header: "Your saved lists couldn't be read" },
                { label: "New list…", icon: "plus", onClick: () => setNaming(true) },
              ]
        }
      />
    )
  );
}

/** Record a yes: which yes, and how it was given -- the two are separate answers. */
function yesMenu(b: BulkCtx, a: BulkActs) {
  const { st, phone, canEdit, keeps, sources, offersSources } = b;
  const { busy, slips } = st;
  return (
    canEdit &&
    keeps("consent") &&
    sources.length > 0 &&
    !slips && (
      <MoreMenu
        btnClass="btn btn-sm"
        escape={phone}
        label="Record a yes"
        title="Which yes, and how it was given — the two are separate answers"
        gated={busy ? "One moment — the last change is still saving" : null}
        items={[
          { header: "Yes to messages about their visit…" },
          ...sources.map((s) => ({ label: s.label, icon: "check", onClick: a.yesBy("conversational", s) })),
          ...(offersSources.length > 0
            ? [
                { header: "Yes to offers and news…" },
                ...offersSources.map((s) => ({ label: s.label, icon: "tag", onClick: a.yesBy("marketing", s) })),
              ]
            : []),
        ]}
      />
    )
  );
}

export function deskBulk(b: BulkCtx, a: BulkActs) {
  const { st, phone, ids, lead, canEdit, canExport, activeSaved, keeps, isOwner, onClear } = b;
  const { busy, naming, noting, setNoting } = st;
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
      {yesMenu(b, a)}
      {slipsBox(b, a)}
      {canEdit && keeps("receptionist") && isOwner && (
        <MoreMenu
          btnClass="btn btn-sm"
          escape={phone}
          label="Receptionist"
          title="What the receptionist does for these people"
          gated={busy ? "One moment — the last change is still saving" : null}
          items={[
            { header: "For these people…" },
            ...PL_MODES.map((m) => ({
              label: plModeWord(m.id),
              icon: m.icon,
              onClick: () => void a.receptionist({ ...m, label: plModeWord(m.id) }),
            })),
          ]}
        />
      )}
      {canEdit && keeps("note") && !noting && (
        <button className="btn btn-sm" disabled={busy} onClick={() => setNoting(true)} data-testid="bulk-note">
          <Icon name="edit" size={12} /> Add a note
        </button>
      )}
      {noteBox(b, a)}
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
