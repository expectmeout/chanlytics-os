/**
 * The bulk bar on a phone (spec 4.5; moved from legacy/pages/people.jsx PeopleBulkBar, decision 0015): one row docked
 * along the foot of the pane, the tab bar's twin: its place, its shape and four equal slots, each a glyph over a word,
 * Clear, Add to list, Note and More (Ruben, 10 Oct 2026: a menu's chevron beside a bare ⋯ said neither what was there
 * nor which came first, and a filled ✕ and the count beside acts packed to the right were four weights in one row). How
 * many are selected is the top bar's, beside Select all and Cancel (screen.tsx phoneBar). A sheet opens for each act
 * but Clear, where an act that asks something first asks it as a step. Add to list is a sheet of the lists kept by hand, as every step here is, never a menu. Select all is the
 * bar's at the top (screen.tsx selectStep). The step is the page's (`sheet`), so its one keyboard listener shuts the
 * sheet on Esc; the drafts are this bar's, as on a desktop. The row is the kit's capsule, docked (data-dock: the tab bar
 * and Ask's circle stand down for it, mobile.css), its parts the kit's Button.
 */
import type { ReactNode } from "react";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import { focusAsDrawn, leaving, type GateProps } from "../../legacy-verbs";
import { JOB_CANCEL, PhoneSheetRow, jobBack } from "../sheets/phone-sheet";
import { PL_MODES, PL_SOURCE_GLYPH, plModeWord } from "../words";
import type { BulkActs } from "./bulk-acts";
import type { BulkCtx } from "./bulk-state";

/** One step of the phone's sheet: its title, a way back to the list it came from, and its body. */
interface Step {
  title: string;
  onBack?: () => void;
  body: ReactNode;
}

/** More: what a selection can become past a list and a note, each behind the role that may do it. */
function moreStep(b: BulkCtx, a: BulkActs): Step {
  const { st, onSheet, canEdit, activeSaved, isOwner, ids, keeps } = b;
  // What the page keeps of People's acts (the Pipeline keeps its lists and its file).
  const canExport = b.canExport && keeps("export");
  const sources = keeps("consent") ? b.sources : [];
  const { busy } = st;
  const n = ids.length;
  return {
    title: `${n} selected`,
    body: (
      <div className="pp-sheet-rows">
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
        {canEdit && isOwner && keeps("receptionist") ? (
          <PhoneSheetRow
            icon="agents"
            label="Receptionist"
            next
            disabled={busy}
            onClick={() => onSheet("receptionist")}
            testid="bulk-receptionist"
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
      </div>
    ),
  };
}

/**
 * Add to list: the lists kept by hand, one press each, then a new one, named as a step with its way back. Where the saved
 * lists could not be read they are not offered, and a new one can still be made.
 */
function listsStep(b: BulkCtx, a: BulkActs, newList: () => void): Step {
  const { st, saved, savedRead, onSheet } = b;
  const { busy } = st;
  return {
    title: "Add to list",
    body: (
      <div className="pp-sheet-rows">
        {savedRead ? (
          saved
            .filter((l) => l.byHand)
            .map((l) => (
              <PhoneSheetRow
                key={l.id}
                icon="filter"
                label={l.name}
                disabled={busy}
                onClick={() => {
                  onSheet(null);
                  void a.addTo(l);
                }}
                testid={`bulk-list-${l.id}`}
              />
            ))
        ) : (
          <p className="pp-sheet-hint pp-sheet-rows-note">Your saved lists couldn't be read.</p>
        )}
        <PhoneSheetRow icon="plus" label="New list" next disabled={busy} onClick={newList} testid="bulk-list-new" />
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
            autoFocus={focusAsDrawn()}
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
      body: (
        <>
          <input
            className="pp-input"
            autoFocus={focusAsDrawn()}
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
      onBack: () => onSheet("lists"),
      body: (
        <>
          <input
            className="pp-input"
            autoFocus={focusAsDrawn()}
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

/**
 * One of the dock's acts, drawn as the tab bar draws a tab: its glyph over its word. People's and Leads' docks draw theirs
 * with it (leads/scope/bulk-bar.tsx). An act a role may not take keeps its place and says why (`gate`, which comes last).
 */
export function dockAct(o: {
  icon: string;
  word: string;
  onPress: () => void;
  disabled: boolean;
  testid: string;
  sheet?: boolean;
  gate?: GateProps | null;
}) {
  return (
    <Button
      variant="quiet"
      className="pp-bulk-act"
      aria-haspopup={o.sheet === false ? undefined : "dialog"}
      disabled={o.disabled}
      onClick={o.onPress}
      data-testid={o.testid}
      {...(o.gate || {})}
    >
      <Icon name={o.icon} size={19} />
      <span>{o.word}</span>
    </Button>
  );
}

/**
 * The dock's acts for who may use them: a list, a note and More for whoever may change people; a file alone for whoever
 * may only export, which needs no sheet. With nobody picked yet they stand and wait.
 */
/** Whether More has anything past the acts up front: a yes, the receptionist, a list to take them off. */
const moreHolds = (b: BulkCtx) =>
  (b.canEdit && b.keeps("consent") && b.sources.length > 0) ||
  (b.canEdit && b.isOwner && b.keeps("receptionist")) ||
  (b.canEdit && !!b.activeSaved && !!b.activeSaved.byHand && b.keeps("lists"));

function dockActs(b: BulkCtx, a: BulkActs) {
  const { st, onSheet, onClear, canEdit, canExport, ids, keeps, lead } = b;
  const { setNote } = st;
  const off = st.busy || ids.length === 0;
  const clear = dockAct({
    icon: "x",
    word: "Clear",
    onPress: onClear,
    disabled: false,
    testid: "bulk-clear",
    sheet: false,
  });
  const exportAct =
    canExport && keeps("export")
      ? dockAct({
          icon: "download",
          word: "Export",
          onPress: a.exportCsv,
          disabled: off,
          testid: "bulk-export",
          sheet: false,
        })
      : null;
  if (!canEdit)
    return (
      <>
        {clear}
        {exportAct}
      </>
    );
  // A page that keeps fewer of People's acts (the Pipeline: its lists and its file, after its own Mark as passed) draws
  // what it keeps, its own act second; with nothing left for More, its file stands in More's place.
  if (b.acts)
    return (
      <>
        {clear}
        {lead}
        {keeps("lists")
          ? dockAct({
              icon: "list",
              word: "Add to list",
              onPress: () => onSheet("lists"),
              disabled: off,
              testid: "bulk-add-list",
            })
          : null}
        {keeps("note")
          ? dockAct({
              icon: "edit",
              word: "Note",
              onPress: () => {
                setNote("");
                onSheet("note");
              },
              disabled: off,
              testid: "bulk-note",
            })
          : null}
        {moreHolds(b)
          ? dockAct({ icon: "menu", word: "More", onPress: () => onSheet("more"), disabled: off, testid: "bulk-more" })
          : exportAct}
      </>
    );
  return (
    <>
      {clear}
      {dockAct({
        icon: "list",
        word: "Add to list",
        onPress: () => onSheet("lists"),
        disabled: off,
        testid: "bulk-add-list",
      })}
      {dockAct({
        icon: "edit",
        word: "Note",
        onPress: () => {
          setNote("");
          onSheet("note");
        },
        disabled: off,
        testid: "bulk-note",
      })}
      {dockAct({ icon: "menu", word: "More", onPress: () => onSheet("more"), disabled: off, testid: "bulk-more" })}
    </>
  );
}

export function phoneBulk(b: BulkCtx, a: BulkActs) {
  const { st, sheet, onSheet, ids } = b;
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
    lists: listsStep(b, a, newList),
    yes: yesStep(b, back, yesOnPhone),
    ...askSteps(b, a, back),
  };
  const step = n > 0 && sheet ? steps[sheet] : null;
  return (
    <>
      <div
        className="cl-bulk pp-bulk capsule"
        ref={leaving("people-dock")}
        data-dock
        role="toolbar"
        aria-label={n ? `${n} people selected` : "Select people"}
        data-testid="bulk-bar"
      >
        <div className="pp-bulk-acts">{dockActs(b, a)}</div>
      </div>
      <Sheet
        open={!!step}
        shape="job"
        title={step ? step.title : ""}
        close={JOB_CANCEL}
        back={step && step.onBack ? jobBack(step.onBack) : null}
        onClose={() => onSheet(null)}
        testid="bulk-sheet"
      >
        {step ? step.body : null}
      </Sheet>
    </>
  );
}
