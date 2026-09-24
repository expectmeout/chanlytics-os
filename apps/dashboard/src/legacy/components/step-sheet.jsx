/* global React */
// Chanlytics — the step sheet (docs/decisions/0007-person-notes.md, amended: a note may have a day).
//
// Where a next step is set or changed from outside the notes card: the deal card's "Set a next step" and its Change,
// and every surface after it that shows a step. Anything asks for it with window.openStepSheet({ personId, dealId?,
// noteId? }), which says so as a `step:sheet` event. StepSheetHost, drawn once by the shell beside the deal sheet,
// hears it, reads the person through the profile's own courier (the tab's copy first, __peekPerson, else
// __personDetail) and draws the record kit's sheet: a dialog beside the page on a desk, rising from the bottom on a
// phone (record-sheet.jsx).
//
// It says nothing of its own. The title, the days it offers, who a step can be for, what it opens with, what is wrong
// before a round trip and the body the notes route takes are contracts' (step-sheet.ts, through
// window.__personNotes). It holds the fold registry under its own id (`step-sheet`), as the deal sheet does: one editor
// open at a time anywhere in the app, and Cancel asks once when something was typed. Save writes through
// window.__personNotes.write with the version the sheet opened over, so a teammate's change since is refused rather
// than written over; then the sheet closes, says so, and dispatches `note:saved` with the person's id, which the
// person page reloads on.

const { useState: useSsState, useEffect: useSsEffect, useRef: useSsRef } = React;

const STEP_SHEET_ID = "step-sheet";
// Where the record kit is not loaded (a harness that draws the host alone): a fold that never opens.
const SS_NO_FOLD = { open: false, asking: null, request: () => false, close: () => {}, discard: () => {}, stay: () => {} };
const SS_CLOSED = { ask: null, person: null, failed: null, draft: null, opened: null, note: null, busy: false, problem: null, armed: false };

// Ask for the sheet from anywhere: a person, the deal a new step names, or the step to change. True when it was asked for.
const openStepSheet = ({ personId = null, dealId = null, noteId = null } = {}) => {
  if (!personId || typeof window.dispatchEvent !== "function") return false;
  window.dispatchEvent(new CustomEvent("step:sheet", { detail: { personId, dealId: dealId || null, noteId: noteId || null } }));
  return true;
};

// The business's zone, for the days the sheet offers (legacy-bridge/zone.ts, window.__clock).
const ssZone = () => (window.__clock && window.__clock.zone ? window.__clock.zone() : "UTC");
// Something the sheet works out as it draws, tried: the answer, or null with the fault reported. The host is drawn by
// the shell outside any page's error boundary, so a person it cannot work out is said in the sheet, never a throw.
const ssWorked = (fn) => {
  try {
    return fn();
  } catch (err) {
    if (window.console) window.console.error("The step sheet could not work this out.", err);
    return null;
  }
};

// When: the picker's days as the kit's toggle group, and the date field for any other day. Hookless.
const StepSheetWhen = ({ sheet, draft, set, problem, busy }) => {
  const W = window.__personNotes.sheetWords;
  return (
    <div className="rec-field step-sheet-when" data-testid="step-sheet-when">
      <span className="rec-field-label" id="step-sheet-when-label">{W.when.label}</span>
      <window.RecordToggleGroup
        labelledBy="step-sheet-when-label"
        value={draft.picking ? "pick" : draft.day}
        options={sheet.days.map((c) => ({ value: c.key, label: c.label }))}
        onChange={(v) => set(v === "pick" ? { picking: true } : { picking: false, day: v })}
        readOnly={busy}
        testid="step-sheet-days"
      />
      {draft.picking ? (
        <window.RecordField
          id="step-sheet-day"
          label={W.when.pick}
          type="date"
          className="deal-sheet-day"
          value={draft.day || ""}
          onChange={(v) => set({ day: v || null })}
          readOnly={busy}
          problem={problem}
          data-testid="step-sheet-day-input"
          testid="step-sheet-day"
        />
      ) : problem ? (
        <window.FieldError id="step-sheet-when-problem" message={problem} testid="step-sheet-when-problem" />
      ) : null}
    </div>
  );
};

// What to do, when, and for whom, in that order; then the one rule a step keeps. Hookless.
const StepSheetFields = ({ sheet, draft, set, problem, busy }) => {
  const N = window.__personNotes;
  const W = N.sheetWords;
  const at = (field) => (problem && problem.field === field ? problem.words : null);
  return (
    <div className="step-sheet-fields">
      <window.RecordField
        id="step-sheet-what"
        label={W.what.label}
        placeholder={W.what.placeholder}
        rows={2}
        maxLength={N.max}
        value={draft.what}
        onChange={(v) => set({ what: v })}
        readOnly={busy}
        problem={at("what")}
        data-testid="step-sheet-what-input"
        testid="step-sheet-what"
      />
      <StepSheetWhen sheet={sheet} draft={draft} set={set} problem={at("day")} busy={busy} />
      {sheet.team.length > 1 && window.DsSelect ? (
        <window.DsSelect
          id="step-sheet-for"
          label={W.for.label}
          value={draft.forId || ""}
          options={sheet.team.map((m) => ({ value: m.id, label: m.label }))}
          onChange={(v) => set({ forId: v || null })}
          busy={busy}
          testid="step-sheet-for"
        />
      ) : null}
      <p className="rec-hint step-sheet-rule" data-testid="step-sheet-rule">{W.teamOnly}</p>
    </div>
  );
};

const StepSheetHost = () => {
  const [toastNode, flash] = window.usePPToast();
  const [st, setSt] = useSsState(SS_CLOSED);
  const kit = window.__personNotes && window.__personNotes.sheet ? window.__personNotes : null;
  // The sheet as it stands: its words, days and team over the person as read, worked out on every draw (pure).
  const sheet = kit && st.ask && st.person
    ? ssWorked(() => kit.sheet(st.person, { noteId: st.ask.noteId, dealId: st.ask.dealId }, Date.now(), ssZone()))
    : null;
  const dirty = !!(kit && st.draft && st.opened && ssWorked(() => kit.sheetDirty(st.draft, st.opened)));
  const fold = window.useRecordFold ? window.useRecordFold(STEP_SHEET_ID, { dirty, saving: st.busy }) : SS_NO_FOLD;
  // Counted on the page as a fold is (record-fold.jsx drawn), for the shell's life.
  useSsEffect(() => (window.__recordFolds && window.__recordFolds.drawn ? window.__recordFolds.drawn(STEP_SHEET_ID) : undefined), []);
  const foldNow = useSsRef(fold);
  foldNow.current = fold;

  // What the sheet opens with, for a person as read, and the step it changes at the version it was opened over.
  const begin = (ask, person) => {
    const made = ssWorked(() => window.__personNotes.sheet(person, { noteId: ask.noteId, dealId: ask.dealId }, Date.now(), ssZone()));
    return { ...SS_CLOSED, ask, person, draft: made ? made.draft : null, opened: made ? made.draft : null, note: made ? made.note : null };
  };
  // The person read, through the profile's own courier, each time the sheet opens and after a refusal. A sheet opened
  // before they were read fills in as they land; after that, what was typed and the version it was opened over stay,
  // and only the person (the team, the step's day as said today) is taken fresh.
  const read = (ask) => {
    const W = window.__personNotes ? window.__personNotes.sheetWords : null;
    if (!window.__personDetail) {
      setSt((s) => (s.ask === ask && !s.person ? { ...s, failed: "" } : s));
      return;
    }
    window.__personDetail(ask.personId).then(
      (vm) => setSt((s) => {
        if (s.ask !== ask) return s;
        if (!vm) return s.person ? s : { ...s, failed: W ? W.gone : "" };
        return s.person ? { ...s, person: vm } : begin(ask, vm);
      }),
      (e) => setSt((s) => (s.ask !== ask || s.person ? s : { ...s, failed: (e && e.message) || "" })),
    );
  };
  useSsEffect(() => {
    const onOpen = (e) => {
      const d = (e && e.detail) || {};
      if (!window.__personNotes || !window.__personNotes.sheet || !d.personId) return;
      const ask = { personId: d.personId, dealId: d.dealId || null, noteId: d.noteId || null };
      const held = window.__peekPerson ? window.__peekPerson(ask.personId) : null;
      setSt(held ? begin(ask, held) : { ...SS_CLOSED, ask });
      foldNow.current.request();
      read(ask);
    };
    window.addEventListener("step:sheet", onOpen);
    return () => window.removeEventListener("step:sheet", onOpen);
  }, []);

  const close = () => { setSt(SS_CLOSED); fold.close(); };
  const set = (patch) => setSt((s) => (s.busy || !s.draft ? s : { ...s, draft: { ...s.draft, ...patch }, problem: null, armed: false }));
  // Cancel, the head's Close, Escape, a press on the wash and a pull down on a phone: nothing while the save is out, and
  // once, asked, when something was typed.
  const cancel = () => {
    if (st.busy) return;
    if (dirty) { setSt((s) => ({ ...s, armed: true })); return; }
    close();
  };

  const save = async () => {
    if (!kit || !sheet || sheet.blocked || st.busy || !st.draft) return;
    const W = kit.sheetWords;
    const ask = st.ask;
    const out = kit.sheetBody({ note: st.note, dealId: sheet.dealId }, st.draft);
    if (out.problem) { setSt((s) => ({ ...s, problem: out.problem, armed: false })); return; }
    setSt((s) => ({ ...s, busy: true, problem: null, armed: false }));
    let r;
    try { r = await kit.write(ask.personId, out.body); } catch (err) { r = { ok: false, message: err && err.message }; }
    if (!r || !r.ok) {
      setSt((s) => (s.ask !== ask ? s : { ...s, busy: false, problem: { field: null, words: (r && r.message) || W.failed } }));
      read(ask);
      return;
    }
    setSt(SS_CLOSED);
    foldNow.current.close();
    flash({ msg: <>{W.done[sheet.mode]}</> });
    window.dispatchEvent(new CustomEvent("note:saved", { detail: { personId: ask.personId } }));
  };

  if (!kit || !fold.open || !st.ask) return toastNode;
  const W = kit.sheetWords;
  const ready = !!(sheet && !sheet.blocked && st.draft);
  const general = st.problem && !st.problem.field ? st.problem.words : null;
  const ask = (props) => <window.Confirm question={W.discard.question} detail={W.discard.detail} yes={W.discard.yes} no={W.discard.no} danger {...props} />;
  const confirm = fold.asking
    ? ask({ onYes: () => { setSt(SS_CLOSED); fold.discard(); }, onNo: () => { setSt((s) => ({ ...s, armed: false })); fold.stay(); }, testid: "step-sheet-ask" })
    : st.armed
      ? ask({ onYes: close, onNo: () => setSt((s) => ({ ...s, armed: false })), testid: "step-sheet-cancel" })
      : null;
  const retry = () => { setSt((s) => ({ ...s, failed: null })); read(st.ask); };
  const body = st.failed !== null && !st.person
    ? <window.FailedRead kind="card" what="this person" why={st.failed || null} onRetry={retry} testid="step-sheet-failed" />
    : !st.person
      ? <div className="route-reading deal-sheet-reading" role="status">{W.reading}</div>
      : !sheet || !st.draft
        ? <window.FailedRead kind="card" what="this person" testid="step-sheet-failed" />
        : sheet.blocked
          ? <p className="deal-sheet-said" data-testid="step-sheet-blocked">{sheet.blocked}</p>
          : <StepSheetFields sheet={sheet} draft={st.draft} set={set} problem={st.problem} busy={st.busy} />;
  return (
    <>
      <window.RecordSheet
        id={STEP_SHEET_ID}
        className="deal-sheet step-sheet"
        title={sheet ? sheet.title : W.titles[st.ask.noteId ? "edit" : "add"]}
        sub={sheet ? sheet.sub : null}
        onClose={cancel}
        onSave={ready ? save : null}
        saving={st.busy}
        saveLabel={sheet ? sheet.save : W.save.add}
        savingLabel={W.saving}
        gate={window.gate ? window.gate("approve", "set a step") : null}
        confirm={confirm}
        foot={general ? <window.FieldError id="step-sheet-problem" message={general} testid="step-sheet-problem" /> : null}
      >
        {body}
      </window.RecordSheet>
      {toastNode}
    </>
  );
};

Object.assign(window, { openStepSheet, StepSheetHost, StepSheetFields });
