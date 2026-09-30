/**
 * The bulk bar on a phone (spec 4.5; moved from legacy/pages/people.jsx PeopleBulkBar, decision 0015): one row docked
 * along the foot of the pane -- ✕, the count, Add to list and ⋯ -- and a sheet with the rest, where an act that asks
 * something first asks it as a step. The step is the page's (`sheet`), so its one keyboard listener shuts the sheet on
 * Esc; the drafts are this bar's, as on a desktop. The row stacked seven controls into a 312px pill over the rows, and
 * each of its three forms ran off the screen's edge.
 */
import type { ReactNode } from "react";
import { Icon } from "../../kit/icon/icon";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { PhoneSheet, PhoneSheetRow } from "../sheets/phone-sheet";
import { PL_MODES, PL_SOURCE_GLYPH, plModeWord } from "../words";
import type { BulkActs } from "./bulk-acts";
import type { BulkCtx } from "./bulk-state";

/** One step of the phone's sheet: its title, a way back to the list it came from, and its body. */
interface Step {
  title: string;
  onBack?: () => void;
  body: ReactNode;
}

/** The steps' first page: what a selection can become, each behind the role that may do it. */
function moreStep(b: BulkCtx, a: BulkActs): Step {
  const { st, rows, onSheet, onSelectAll, canEdit, canExport, activeSaved, sources, isOwner, ids } = b;
  const { busy, setNote } = st;
  const n = ids.length;
  return {
    title: `${n} selected`,
    body: (
      <div className="pp-sheet-rows">
        {onSelectAll && n < rows.length ? (
          <PhoneSheetRow
            icon="check"
            label={`Select all ${rows.length}`}
            onClick={() => {
              onSheet(null);
              onSelectAll();
            }}
            testid="bulk-select-all"
          />
        ) : null}
        {canEdit && sources.length > 0 ? (
          <PhoneSheetRow
            icon="shield"
            label="Record a yes"
            next
            disabled={busy}
            onClick={() => onSheet("yes")}
            testid="bulk-yes"
          />
        ) : null}
        {canEdit && isOwner ? (
          <PhoneSheetRow
            icon="agents"
            label="Receptionist"
            next
            disabled={busy}
            onClick={() => onSheet("receptionist")}
            testid="bulk-receptionist"
          />
        ) : null}
        {canEdit ? (
          <PhoneSheetRow
            icon="edit"
            label="Add a note"
            next
            disabled={busy}
            onClick={() => {
              setNote("");
              onSheet("note");
            }}
            testid="bulk-note"
          />
        ) : null}
        {canExport ? (
          <PhoneSheetRow
            icon="external"
            label="Export"
            meta="CSV"
            disabled={busy}
            onClick={() => {
              onSheet(null);
              a.exportCsv();
            }}
            testid="bulk-export"
          />
        ) : null}
        {canEdit && activeSaved && activeSaved.byHand ? (
          <PhoneSheetRow
            icon="x"
            label={`Take off ${activeSaved.name}`}
            disabled={busy}
            onClick={() => {
              onSheet(null);
              void a.dropFromList();
            }}
            testid="bulk-drop-list"
          />
        ) : null}
        {!canEdit ? (
          <p className="pp-sheet-hint pp-sheet-rows-note">
            Only an owner or operator can add to lists or record a yes.
          </p>
        ) : null}
      </div>
    ),
  };
}

/** Record a yes: to messages about their visit, and where offers may be given by the form they signed, to offers and news. */
function yesStep(
  b: BulkCtx,
  back: () => void,
  yesOnPhone: (purpose: "conversational" | "marketing", s: { id: string; label: string }) => () => void,
): Step {
  const { st, sources, offersSources } = b;
  const { busy } = st;
  return {
    title: "Record a yes",
    onBack: back,
    body: (
      <div className="pp-sheet-rows">
        <div className="pp-sheet-rows-h">To messages about their visit</div>
        {sources.map((s) => (
          <PhoneSheetRow
            key={s.id}
            icon={PL_SOURCE_GLYPH[s.id] || "check"}
            label={s.label}
            next={s.id === "form"}
            disabled={busy}
            onClick={yesOnPhone("conversational", s)}
            testid={`bulk-yes-conversational-${s.id}`}
          />
        ))}
        {offersSources.length > 0 ? (
          <>
            <div className="pp-sheet-rows-h">To offers and news</div>
            {offersSources.map((s) => (
              <PhoneSheetRow
                key={s.id}
                icon={PL_SOURCE_GLYPH[s.id] || "tag"}
                label={s.label}
                next={s.id === "form"}
                disabled={busy}
                onClick={yesOnPhone("marketing", s)}
                testid={`bulk-yes-marketing-${s.id}`}
              />
            ))}
          </>
        ) : null}
      </div>
    ),
  };
}

/** The steps that ask something first: which forms they signed, the receptionist's mode, a note, a new list's name. */
function askSteps(b: BulkCtx, a: BulkActs, back: () => void) {
  const { st, onSheet } = b;
  const { busy, note, setNote, name, setName, setSlips, slipsNote, setSlipsNote } = st;
  return {
    slips: {
      title: "Which forms they signed",
      onBack: () => {
        setSlips(null);
        setSlipsNote("");
        onSheet("yes");
      },
      body: (
        <>
          <input
            className="pp-input"
            autoFocus
            value={slipsNote}
            placeholder="Which slips, e.g. Saturday's"
            maxLength={200}
            disabled={busy}
            aria-label="Which forms they signed"
            onChange={(e) => setSlipsNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void a.recordSlips();
              if (e.key === "Escape") a.closeSlips();
            }}
            data-testid="bulk-form-note"
          />
          <button
            type="button"
            className="btn btn-primary pp-sheet-go"
            disabled={busy || !slipsNote.trim()}
            onClick={a.recordSlips}
            data-testid="bulk-form-save"
          >
            Record
          </button>
        </>
      ),
    },
    receptionist: {
      title: "Receptionist",
      onBack: back,
      body: (
        <div className="pp-sheet-rows">
          <div className="pp-sheet-rows-h">For these people</div>
          {PL_MODES.map((m) => (
            <PhoneSheetRow
              key={m.id}
              icon={m.icon}
              label={plModeWord(m.id)}
              disabled={busy}
              onClick={() => {
                onSheet(null);
                void a.receptionist({ ...m, label: plModeWord(m.id) });
              }}
              testid={`bulk-mode-${m.id}`}
            />
          ))}
        </div>
      ),
    },
    note: {
      title: "Add a note",
      onBack: back,
      body: (
        <>
          <input
            className="pp-input"
            autoFocus
            value={note}
            placeholder="One line, under their notes"
            maxLength={200}
            disabled={busy}
            aria-label="The note"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void a.addNote();
              if (e.key === "Escape") {
                setNote("");
                onSheet(null);
              }
            }}
            data-testid="bulk-note-line"
          />
          <button
            type="button"
            className="btn btn-primary pp-sheet-go"
            disabled={busy || !note.trim()}
            onClick={a.addNote}
            data-testid="bulk-note-save"
          >
            Add
          </button>
        </>
      ),
    },
    naming: {
      title: "New list",
      body: (
        <>
          <input
            className="pp-input"
            autoFocus
            value={name}
            placeholder="Name the list"
            maxLength={60}
            disabled={busy}
            aria-label="The list's name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void a.createAndAdd();
              if (e.key === "Escape") {
                setName("");
                onSheet(null);
              }
            }}
            data-testid="bulk-list-name"
          />
          <button
            type="button"
            className="btn btn-primary pp-sheet-go"
            disabled={busy || !name.trim()}
            onClick={a.createAndAdd}
            data-testid="bulk-list-save"
          >
            Make it
          </button>
        </>
      ),
    },
  };
}

/** The bar's Add to list: the lists kept by hand, or, where the saved lists could not be read, a new one alone. */
function addToListMenu(b: BulkCtx, a: BulkActs, newList: () => void) {
  const { st, saved, savedRead } = b;
  return (
    <MoreMenu
      btnClass="btn btn-sm"
      escape
      label="Add to list"
      title="Add to a list"
      gated={st.busy ? "One moment — the last change is still saving" : null}
      items={
        savedRead
          ? [
              { header: "Add to" },
              ...saved
                .filter((s) => s.byHand)
                .map((s) => ({ label: s.name, icon: "filter", onClick: () => void a.addTo(s) })),
              { label: "New list…", icon: "plus", onClick: newList },
            ]
          : [
              // Lists that could not be read are not offered; a new one can still be made.
              { header: "Your saved lists couldn't be read" },
              { label: "New list…", icon: "plus", onClick: newList },
            ]
      }
    />
  );
}

export function phoneBulk(b: BulkCtx, a: BulkActs) {
  const { st, sheet, onSheet, onClear, canEdit, ids } = b;
  const { setName, setSlips, setSlipsNote } = st;
  const n = ids.length;
  const back = () => onSheet("more");
  // A spoken yes is recorded at the tap; a sign-up form's waits for the note that says which forms.
  const yesOnPhone = (purpose: "conversational" | "marketing", s: { id: string; label: string }) => () => {
    if (s.id === "form") {
      setSlips({ purpose, source: s });
      setSlipsNote("");
      onSheet("slips");
      return;
    }
    onSheet(null);
    void a.yes(purpose, s);
  };
  const newList = () => {
    setName("");
    onSheet("naming");
  };
  const steps: Record<string, Step | undefined> = {
    more: moreStep(b, a),
    yes: yesStep(b, back, yesOnPhone),
    ...askSteps(b, a, back),
  };
  const step = n > 0 && sheet ? steps[sheet] : null;
  return (
    <>
      <div className="cl-bulk pp-bulk" role="toolbar" aria-label="Selected people" data-testid="bulk-bar">
        <button
          type="button"
          className="pp-bar-icon"
          aria-label="Clear the selection"
          onClick={onClear}
          data-testid="bulk-clear"
        >
          <Icon name="x" size={18} />
        </button>
        <span className="cl-bulk-count">
          {n ? (
            <>
              <b>{n}</b> selected
            </>
          ) : (
            "Tap people to select them"
          )}
        </span>
        {canEdit && n > 0 && addToListMenu(b, a, newList)}
        {n > 0 && (
          <button
            type="button"
            className="pp-bar-icon"
            aria-label={`More for the ${n} selected`}
            aria-haspopup="dialog"
            onClick={() => onSheet("more")}
            data-testid="bulk-more"
          >
            <Icon name="more" size={18} />
          </button>
        )}
      </div>
      {step && (
        <PhoneSheet title={step.title} onBack={step.onBack || null} onClose={() => onSheet(null)} testid="bulk-sheet">
          {step.body}
        </PhoneSheet>
      )}
    </>
  );
}
