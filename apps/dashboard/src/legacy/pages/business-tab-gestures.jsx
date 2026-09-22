/* global React */
// Chanlytics — Settings › Business: the page's three gestures.
//
// A row edited in its place (BtRow, over the kit's RecordInline), a set of fields folded open under its row (BtFold,
// over the kit's RecordFold), and a list too long for a fold, in a sheet beside the page (BtSheet, over the kit's
// RecordSheet); the two questions every one asks before anything typed is thrown away (useBtAsk, btAsks); and the
// editor a fold and a sheet both are (useBtEditor), written once. The kit (components/record-*.jsx) holds the gesture
// itself -- focus, keys, the foot, the registry that keeps one editor open; what is the page's is here, once, for every
// row, fold and sheet of every card: the draft, what stops a save, the save through the tab's one saver
// (business-tab-save.jsx) or a row's own door, and what the receptionist will be told (business-tab-folds.jsx willSay).
// A card (business-tab-who.jsx, business-tab-open.jsx, business-tab-offer.jsx, and the card Task 3.5 brings) draws its
// rows' values and its folds' and sheets' fields, and nothing of this.
//
// Loaded after business-tab-folds.jsx and before the cards (both load lists); the cards read window.BtRow,
// window.BtFold and window.BtSheet as they draw. Its top-level names are bt-prefixed and its hook aliases its own
// (useBtg*), and no pattern in it holds an object rest, for the reasons business-tab-save.jsx gives. The tests' stub
// React (tooling/scripts/tests/_legacy-react.mjs) keeps every hook on the page as a cell in one order, so a component
// holding hooks that is drawn on one render and not the next moves every cell after it: the row and the fold are drawn
// on every render (closed, the kit hides them whole), and what comes and goes inside them (a row at rest, a Confirm, a
// note) holds none. The sheet's editor is drawn on every render too; the kit's sheet, drawn only while it is open, is
// the page's LAST hook-holding child (BtSheet says how). That is the stub's rule, not React's.

const { useState: useBtgState, useEffect: useBtgEffect, useRef: useBtgRef } = React;

/* ------------------------------------ one value, edited where it is stated ------------------------------------ */

// What the four rows that are only words say once the server has taken a change: the canvas's Edit-Inline words. The
// two number rows keep the sentences they have always said (PublishedNumberRow, HandoffRow).
const BT_SAVED = "Saved — the receptionist picks it up within a minute";

const btNoCheck = () => null;

/**
 * Something a row or a fold works out AS IT DRAWS, tried: its answer, or `otherwise` when it throws, with the fault
 * reported. The page is untyped, the helpers it asks (business-tab-folds.jsx, the bridge) throw on a draft they were not
 * written for (a switch a body left out, a bridge function the standalone mockup lacks), and a throw while drawing is
 * the shell's error boundary's: the whole of Settings replaced by "something went wrong", over one fold's footer. What
 * cannot be worked out is not drawn; the page stays, and what was typed with it.
 */
const btWorkedOut = (what, fn, otherwise = null) => {
  try {
    return fn();
  } catch (err) {
    if (window.console) window.console.error(`Settings › Business could not work out ${what}.`, err);
    return otherwise;
  }
};
/**
 * The two questions an open editor asks before anything typed is thrown away, for a row edited in its place and for a
 * fold alike: Cancel's own, and the registry's, when another row is asked for (or the standing line's door is pressed)
 * while this one holds changes. Each gesture held a copy of this block, and both copies had the same fault: Cancel armed
 * its question, another row's act drew the registry's over it, "Keep editing" took the registry's away, and Cancel's
 * was still armed behind it, so the owner was asked the same thing twice. They are ONE question: whichever is on
 * screen, its answer answers both.
 *
 * useBtAsk() holds whether Cancel's is armed (the one hook here; it stands where each gesture's `arm` stood). btAsks
 * builds, from it and the gesture's own close and reset, the `cancel` the kit's foot and Escape call and the `confirm`
 * the kit draws above Save. A gesture's reset disarms, as it always did.
 */
const useBtAsk = () => {
  const [armed, setArmed] = useBtgState(false);
  return { armed, arm: () => setArmed(true), disarm: () => setArmed(false) };
};
const btAsks = ({ ask, fold, prefix, busy, dirty, close, reset }) => {
  const words = { question: "Discard your changes?", detail: "Nothing you changed here has been saved.", yes: "Yes, discard", no: "Keep editing" };
  return {
    // Not while it saves: the save is on its way, and closes the editor when the server takes it (record-fold.jsx).
    cancel: () => {
      if (busy) return;
      if (dirty) { ask.arm(); return; }
      close();
    },
    confirm: fold.asking ? (
      <window.Confirm {...words} danger onYes={() => { reset(); fold.discard(); }} onNo={() => { ask.disarm(); fold.stay(); }} testid={`${prefix}-ask`} />
    ) : ask.armed ? (
      <window.Confirm {...words} danger onYes={close} onNo={ask.disarm} testid={`${prefix}-cancel`} />
    ) : null,
  };
};

// What a toast's Undo says when it can put nothing back: the fold it was in has closed, or its save is out, or the list
// the row came from was replaced whole since (a day's hours copied over another's).
const BT_UNDO_CLOSED = "Not put back — the editor it was in has closed. Open it again to change it.";
const BT_UNDO_SAVING = "Not put back — this is being saved.";
const BT_UNDO_REPLACED = "Not put back — the list it came from was replaced since, so it has no place to go.";

/* ------------------------------------ the rows an Undo may still put back ------------------------------------ */

// A list is known by its name, always: two lists rows() could not tell apart would share their put-backs, and a removal
// in one would move the other's (Monday's shifts moved Tuesday's, the quality review's P1).
const btListNamed = (list, who = "BtPutBacks") => {
  if (typeof list !== "string" || list === "") {
    throw new TypeError(`${who} needs the list's name (a services list, "closures", one day's "hours-mon"), not ${JSON.stringify(list)}.`);
  }
  return list;
};

/**
 * The rows taken out of the lists of a draft that an Undo may still put back, as a pure value: an array of
 * { id, list, at, row }, each list's in that list's own order, `at` being how many of the list's rows come before it.
 * Nothing here changes what it is handed; each answers the next value.
 *
 * A row goes back between the same two rows it was taken from, whatever was taken out or put back since. So a put-back
 * moves with the rows around it: a row taken out before it moves it up a place, and one put back before it moves it
 * down one, in its own list and no other. Each Undo once kept the index its row had when it went, so with Service 6 out
 * and then Service 3, Service 6's went back between 7 and 8 (the spec review's repro).
 *   taken(backs, list, i, { id, row })  row i of `list` went. It is placed after every put-back already waiting before
 *                                       row i and before every one after it, so two in one gap go back in their order.
 *   restored(backs, id)                 the put-back `id` is a row again: every one after it in its list moves down.
 *   dropped(backs, list)                `list` was replaced whole from outside its rows(): its put-backs have no place.
 *   of(backs, list), find(backs, id)    a list's, in order; one by its id, or null.
 */
const BtPutBacks = Object.freeze({
  none: Object.freeze([]),
  taken(backs, list, i, entry) {
    btListNamed(list);
    const after = backs.findIndex((b) => b.list === list && b.at > i);
    const moved = backs.map((b) => (b.list === list && b.at > i ? { ...b, at: b.at - 1 } : b));
    const where = after < 0 ? moved.length : after;
    return [...moved.slice(0, where), { id: entry.id, list, at: i, row: entry.row }, ...moved.slice(where)];
  },
  restored(backs, id) {
    const k = backs.findIndex((b) => b.id === id);
    if (k < 0) return backs;
    const { list } = backs[k];
    return backs.filter((_, j) => j !== k).map((b, j) => (j >= k && b.list === list ? { ...b, at: b.at + 1 } : b));
  },
  dropped(backs, list) {
    btListNamed(list);
    return backs.filter((b) => b.list !== list);
  },
  of(backs, list) {
    btListNamed(list);
    return backs.filter((b) => b.list === list);
  },
  find(backs, id) {
    return backs.find((b) => b.id === id) || null;
  },
});
// What a Save says when its own checks could not run: nothing was sent, and the editor stays open with what was typed.
const BT_UNCHECKED = "Not saved — this could not be checked, so nothing was sent. Try again, and tell us if it keeps happening.";

/**
 * One of this page's rows: at rest a RecordRow, and while it is edited the kit's inline editor (RecordInline,
 * record-fold.jsx), which holds the gesture itself -- its focus, its keys, what saving writes and its foot. What is the
 * page's is here: the draft, what stops a save, the save through the tab's one saver, what the receptionist will be
 * told, and the row's disagreement with its press.
 *
 * At rest the row is its value, where the value came from, and one act. The act opens the editor in the row's place.
 * What stops a save is said under the box before any round trip, never as a toast. Cancel with changes asks first, as
 * the form this replaces did (S22). When the server accepts, the editor closes and the toast says so; the surface's
 * refresh finishes behind it.
 *
 * It holds the fold registry (record-fold.jsx) as a fold does, so one editor or fold is open on the page at a time:
 * opening another row closes a clean editor and asks about one holding changes, and the Settings rail and the
 * browser's unload prompt ask before its changes are thrown away. Its dirty test is bound to its id as it mounts, so
 * it is asked however the row was opened: by its own act, or by its id from the standing line's door.
 *
 * What a row writes is handed to it in four answers, the last three built from business-tab-save.jsx's check, stored
 * value and patch for the row: `initial` (the draft it opens with, from what is stored), `storedAs` (what a draft would
 * store, which is what "holds changes" is judged by; not `valueOf`, which every props object already has from
 * Object.prototype, so a default for it never applies), `check` (the sentence that stops a save, or null), and
 * `commit` (the one-key change a save makes, with its toast's words). `body` draws the box; it is handed the draft, its
 * setter, what stops it, the field's own ids, whether the row's save is out (`readOnly`, which the field's props carry
 * too), and whether the editor is `open`, for a body that works out less while it is not. A disagreement on the row names the other answer and the draft that takes it (`disputed.use`), which
 * saves through the same `commit`.
 *
 * While its save is out the row is not an open, unsaved editor (record-fold.jsx): its box takes no typing, since what
 * was typed under "Saving…" was dropped without a word when the save landed, and the registry is told the save is out,
 * so another row's act waits for its answer.
 *
 * `section` is the row's name to consequenceOf (FOLD_BLOCK) where it is not the row's id, or the names of each block
 * its save can change: a rename changes the line the prompt opens with and, where the stored prompt is the product's
 * own, that too. `channel` is the one the row's words are read on; the transfer number is a call's, and changes nothing
 * on WhatsApp. Null is no channel that reads them on this workspace, and the row says nothing it will say.
 *
 * `brain` is the settings read's, which the row states and opens from; `base` is the config its save will go on (the
 * saver's base()), which is what it will say is worked out on. The two differ while another save is out, or taken and
 * not read back yet.
 *
 * `door` is for a row the settings save does not write (the timezone, which is the workspace's): { save(draft, done),
 * pending() }, the row's own way out in place of the tab's saver and `commit`. Everything else is the row's as for any
 * other: one editor open, its asks, its box read-only and the registry told while its save is out. Its pending state
 * must outlive the page, as the saver does (business-tab-save.jsx keeps the zone's); a door that kept it in a
 * component would draw a page come back to mid-save as not saving. Such a row writes no block of the prompt, and says
 * nothing it will say.
 *
 * `named` is what the row holds, said as a thing, where its label is a phrase: a screen reader hears the act as its
 * words and the label together, and "Change Tells customers to call" says nothing, where "Change the number customers
 * are told to call" does. A row whose label is a noun needs none ("Change Website", "Add one Address").
 */
const BtRow = ({
  id, section = null, label, named = null, brain, base = null, value = null, empty = null, hint = null, source = null,
  disputed = null, wrong = null, initial, storedAs: stores = null, check = btNoCheck, commit = null, door = null, body,
  channel = "whatsapp", canEdit = true, gate = null, flash = () => {}, saver = null,
}) => {
  // What saving writes is business-tab-save.jsx's, read as the row draws (that file loads before this one).
  const S = window.__businessTabSave;
  // A row of words stores its draft trimmed.
  const storedAs = stores || S.trimmed;
  const [draft, setDraft] = useBtgState(null);
  const [problem, setProblem] = useBtgState(null);
  const ask = useBtAsk();
  // What the registry reads when it asks whether this row holds changes. A keystroke lands here as it is typed, so a
  // press on another row straight after typing is asked about even before the page has drawn again.
  const live = useBtgRef({ draft: null, initial: null, storedAs, open: false });
  const holds = () => {
    const l = live.current;
    return l.open && l.draft != null && !S.same(l.storedAs(l.draft), l.storedAs(l.initial));
  };
  // The tab's one saver (business-tab-save.jsx): this row's save waits its turn behind any other, and goes on the
  // config current then. The registry asks whether it is out as it asks whether the row holds changes: when it needs to.
  const out = () => (door ? !!door.pending() : !!(saver && saver.pending(id)));
  const busy = out();
  const fold = window.useRecordFold(id, { dirty: holds, saving: out });
  // A role that may not change the business never has an editor, whatever asked for one.
  const open = fold.open && canEdit;
  live.current.initial = initial;
  live.current.storedAs = storedAs;
  live.current.open = open;
  const now = open && draft != null ? draft : initial;
  const dirty = open && !S.same(storedAs(now), storedAs(initial));
  const save = (c, done) => { if (saver) saver.save({ row: id, change: c.change, said: c.said, done, flash }); };
  // Closed by anything -- saved, cancelled, or given way to another row -- the draft goes with it, and the next
  // opening starts from what is stored.
  const reset = () => { live.current.draft = null; setDraft(null); setProblem(null); ask.disarm(); };
  useBtgEffect(() => { if (!open) reset(); }, [open]);

  // Nothing is typed into a save that is out: the box is read-only then, and this is the same rule for whatever else
  // the row's body draws. Asked at the moment of the change: a press made before the page has drawn again is live.
  const set = (d) => { if (out()) return; live.current.draft = d; setDraft(d); if (problem) setProblem(null); if (ask.armed) ask.disarm(); };
  const close = () => { reset(); fold.close(); };
  const refused = !!(gate && gate["aria-disabled"]);
  const asks = btAsks({ ask, fold, prefix: `rec-inline-${id}`, busy, dirty, close, reset });
  const submit = () => {
    if (busy || !open || refused) return;
    const bad = check(now);
    if (bad) { setProblem(bad); return; }
    // Nothing to write is nothing to send: the editor closes and says nothing, since nothing was saved.
    if (!dirty) { close(); return; }
    // Saved with Ctrl or Cmd and Enter while Cancel's question was up: the question is answered.
    if (ask.armed) ask.disarm();
    if (door) door.save(now, close); else save(commit(now), close);
  };

  // What saving would tell the receptionist: the lines of its blocks that the draft changes, and the sentence for a
  // save that crosses the resolver's own line, from the one helper the folds ask too (business-tab-folds.jsx willSay,
  // which says what each part is). Only for a draft the save would send, and only while the editor is open, because
  // each call parses the whole brain and resolves a full prompt. Nothing is drawn when nothing changes: never an empty
  // "It will say".
  let says = null;
  if (dirty && commit && !check(now)) {
    // Both brains are the saver's: the one this row's save will go on (its base), and that one with this row's patch
    // applied as the saver will apply it (patched), on a copy, so a patch that edits a nested object in place leaves
    // the base as it was. Tried, since it is worked out as the row draws (btWorkedOut).
    const on = base && base.brain ? base : { brain };
    const will = btWorkedOut(`what the ${id} row will say`, () => S.willSay({ was: on.brain, next: S.patched(on, { change: commit(now).change }).brain, sections: section || id, channel }));
    if (will && (will.added || will.removed || will.note)) says = { note: will.note, says: will.added, gone: will.removed };
  }

  // A disagreement, as the kit draws one: the other answer, in the resolver's own sentence when there is one, and one
  // press that takes it, saved through this row's own commit and gated like every press on the row. A role that may not
  // change the business reads the disagreement and is offered no press, as it is offered no act; nor is anyone, where
  // the other answer is information rather than a fill (btDispute's `use` is null). Nor where the row has no `commit`
  // to save it through (a row with a `door`, the zone's), as the will-say block asks too: the press called commit and
  // threw.
  const other = disputed ? {
    value: disputed.value,
    source: disputed.source,
    severity: disputed.severity,
    sentence: disputed.sentence,
    useLabel: disputed.useLabel,
    onUse: canEdit && commit && disputed.use != null ? () => {
      if (busy) return;
      const bad = check(disputed.use);
      if (bad) { flash({ tone: "warn", msg: <>{bad}</> }); return; }
      save(commit(disputed.use), () => {});
    } : undefined,
    gate,
  } : null;

  // The field is named by the row's own label, where the label stays (the canvas's editing row), rather than by a
  // second copy of it over the box; what it will say describes the box too. Both ids are the kit's (RecordInline).
  const field = { id: `bt-${id}`, label: null, "aria-labelledby": `rec-inline-${id}-key`, "aria-describedby": says ? `rec-inline-${id}-says` : undefined, readOnly: busy || undefined };
  // Drawn on every render, open or not: the box holds hooks of its own (RecordField's id).
  const inner = body({ draft: now, set, problem, field, gate, readOnly: busy, open });
  return (
    <>
      {open ? null : (
        <window.RecordRow
          id={id}
          label={label}
          value={value}
          empty={empty}
          hint={hint}
          source={source}
          disputed={other}
          wrong={wrong}
          act={canEdit ? {
            label: value ? "Change" : "Add one",
            name: named ? (value ? `Change the ${named}` : `Add one ${named}`) : undefined,
            onClick: () => fold.request(),
            gate,
          } : null}
        />
      )}
      <window.RecordInline
        id={id}
        label={label}
        open={open}
        disputed={other}
        says={says ? says.says : null}
        saysLabel="It will say"
        gone={says ? says.gone : null}
        goneLabel="It will no longer say"
        note={says ? says.note : null}
        confirm={asks.confirm}
        onSave={submit}
        onCancel={asks.cancel}
        saving={busy}
        gate={gate}
      >
        {inner}
      </window.RecordInline>
    </>
  );
};


/* ------------------------------------ a set of fields: the editor a fold and a sheet both are ------------------------------------ */

/**
 * What an editor opens over, and whether it can open at all: the config its save will go on (the saver's base), the
 * draft its part of it opens as, which the body is drawn with while it is closed, and `can`, which needs both. The
 * draft is tried, like everything else worked out as the page draws (btWorkedOut): an editor whose part of the record
 * cannot be read opens nothing and offers no act, and its row still says what it says. One test, for the editor and for
 * a row that opens a sheet drawn elsewhere (BtSheet.opens): the row once asked a copy of it.
 */
const btOpening = (id, saver) => {
  const base = saver ? saver.base() : null;
  const stored = btWorkedOut(`the draft the ${id} fold opens with`, () => ({ draft: window.__businessTabSave.draftOf(id, base || {}) }));
  return { base, stored, can: !!base && !!stored };
};

/**
 * The editor behind one of this page's folds, and behind its sheet: the draft, what stops a save, the save through the
 * tab's one saver, what the receptionist will be told, the two asks, and every rule a list in the draft has. A fold
 * draws it under its row (BtFold, below); a list too long for a fold draws it in a sheet beside the page (BtSheet,
 * below). Both are the same editor, written once, because the services sheet needed every rule a fold keeps -- the cap
 * through an Undo, the removal said only when it happened, the row back at its index, one editor open at a time, the
 * asks -- and a second copy of them would be the one that drifts. A card never calls this: it hands BtFold or BtSheet
 * its fields.
 *
 * It follows business-tab-folds.jsx's contract to the letter, because an editor that did not would lose a colleague's
 * change or a workspace's prompt without a word:
 *   as it opens     the draft is draftOf(id, saver.base()), kept as `opened`. Until the editor is typed in, `opened` is
 *                   taken again from the base on every draw: an untouched fold FOLLOWS what is stored, so a colleague's
 *                   change read back into this tab is shown as it stands, said as nothing that goes, and the first
 *                   keystroke after it is a change to the week as it is now, not a save refused as "changed after you
 *                   opened it". Typed in, or while its save is out, `opened` holds still, and foldJob's refusal stands;
 *   unsaved changes the draft is not the one it opened with, asked by the registry however the editor was opened (its
 *                   own act, or its id from the standing line's door), by the Settings rail, by the browser, and by
 *                   Cancel. NOT holdsChanges, which judges what the save would WRITE: a shift typed half-way, a closed
 *                   day's note with no date yet, a day switched on with no times and a service with no name are all
 *                   dropped by the save, so they read as nothing, and Cancel threw them away without a question. The
 *                   form this replaces counted any change, and so does this. Asking once too often loses nothing;
 *   on Save         the page's own checks first (problemsOf), each sentence under its field: a shift typed half-way is
 *                   dropped by the save, so a week that "changes nothing" because of one must still be refused, never
 *                   closed as if saved. Then nothing to write (holdsChanges, which stays the test for whether Save
 *                   sends anything) is nothing to send, and the editor closes. Then the save's own schema
 *                   (saveProblems). Only then saver.save(foldJob(...)), never a hand-written patch. An editor nobody
 *                   typed in closes at once: nothing was asked of it, so nothing of it is judged (a non-owner's
 *                   calendar address arrives masked, and would be refused as no address at all);
 *   it will say     willSay on saveFold(id, saver.base(), draft).brain, only while it is open and only for a draft the
 *                   page's own checks pass: the whole block under "Your receptionist will be told", the lines that go,
 *                   the block's share of the prompt (`chars`), and the sentence for a save that crosses the resolver's
 *                   line. `channel` null says none (the calendar's address and the zone are in no draft of the brain).
 *
 * `prefix` names its two asks' Confirms (rec-fold-<id>, rec-sheet-<id>). What a body is handed is `fields` in what it
 * answers, which BtFold's contract says in full.
 */
const useBtEditor = ({ id, canEdit = true, gate = null, flash = () => {}, saver = null, said = BT_SAVED, channel = "whatsapp", prefix }) => {
  const S = window.__businessTabSave;
  const [draft, setDraft] = useBtgState(null);
  const [problems, setProblems] = useBtgState(null);
  const ask = useBtAsk();
  // The row a list was just given, or any row the body names (focus), for the kit to put focus in (rows' add).
  const [focusOn, setFocusOn] = useBtgState(null);
  // What the registry, an Undo and a keystroke read: the latest draft, whatever the page has drawn since.
  // `backs` are the rows taken out of the draft's lists that an Undo may still put back (BtPutBacks), `agains` each one's
  // Undo by its id, and `produced` each list as its own rows() last left it (rows, below).
  const live = useBtgRef({ draft: null, opened: null, open: false, opening: 0, backs: BtPutBacks.none, agains: new Map(), produced: new Map(), seq: 0 });
  const busy = saver ? saver.pending(id) : false;
  const { base, stored, can } = btOpening(id, saver);
  // Anything typed is something to ask about, whether or not the save would write it (the header says why).
  const holds = () => {
    const l = live.current;
    return !!(l.open && l.draft != null && !S.same(l.draft, l.opened));
  };
  const fold = window.useRecordFold(id, { dirty: holds, saving: () => !!(saver && saver.pending(id)) });
  // A role that may not change the business never has an editor, whatever asked for one; nor does a page with nothing
  // read to save onto, nor a part of the record its draft cannot be worked out of (btOpening).
  const open = fold.open && canEdit && can;
  // Closed by anything -- saved, cancelled, or given way to another row -- the draft goes with it, and the next
  // opening starts from what is stored.
  const reset = () => { live.current.draft = null; live.current.opened = null; live.current.backs = BtPutBacks.none; live.current.agains = new Map(); live.current.produced = new Map(); setDraft(null); setProblems(null); ask.disarm(); setFocusOn(null); };
  useBtgEffect(() => { if (!open) reset(); }, [open]);
  if (open && live.current.opened == null) live.current.opening += 1;
  // Untouched and not saving, the editor opens with what is stored NOW (the header says why); typed in, what it opened
  // with holds still, since that is what its save is judged against.
  if (open && (live.current.opened == null || (draft == null && live.current.draft == null && !busy))) live.current.opened = stored.draft;
  live.current.open = open;
  const now = open ? (draft != null ? draft : live.current.opened) : (stored ? stored.draft : null);
  const dirty = open && draft != null && !S.same(draft, live.current.opened);
  const found = problems || {};

  // Nothing is typed into a save that is out (record-fold.jsx): asked of the saver at the moment of the change, since an
  // Undo is pressed long after the draw that made it. It answers whether it took the change, for whoever would say so.
  const update = (fn, keys) => {
    const l = live.current;
    if (!l.open || (saver && saver.pending(id))) return false;
    const next = fn(l.draft != null ? l.draft : l.opened);
    l.draft = next;
    setDraft(next);
    setProblems((was) => {
      if (!was || !keys) return null;
      const left = { ...was };
      keys.forEach((k) => { delete left[k]; });
      return Object.keys(left).length ? left : null;
    });
    ask.disarm();
    return true;
  };
  // A toast's Undo outlives the editor that made the change: pressed after it has closed (cancelled, or saved and closed
  // by its save), the draft it would put something back into is gone, and pressed while the save is out nothing is
  // typed into it. Either way it says so, in the warn tone: an Undo that did nothing and said nothing read as broken.
  const undo = (fn) => {
    const at = live.current.opening;
    return () => {
      if (!live.current.open || live.current.opening !== at) { flash({ tone: "warn", msg: <>{BT_UNDO_CLOSED}</> }); return false; }
      if (update(fn)) return true;
      flash({ tone: "warn", msg: <>{BT_UNDO_SAVING}</> });
      return false;
    };
  };
  const change = (fn, words = {}) => {
    if (!update(fn, words.keys)) return false;
    if (words.said) flash({ msg: words.said, undo: words.back ? undo(words.back) : undefined });
    return true;
  };
  const rows = ({ id: listId, name = null, max = Infinity, blank = () => ({}), keysOf = () => [], key = null, full = null, list = (d) => d, put = (d, l) => l }) => {
    // Required, and refused loudly: two lists rows() could not tell apart would share their put-backs (BtPutBacks).
    btListNamed(listId, "rows()");
    const drafted = () => (live.current.draft != null ? live.current.draft : live.current.opened);
    const latest = () => list(drafted()) || [];
    const own = (keys) => (key ? keys.concat([key]) : keys);
    // The list as its own rows() last left it. Replaced whole from outside (a day's hours copied over another's, a
    // week put back by its copy's Undo), it is no longer that list, and a row waiting to go back into it has no place:
    // its put-backs are dropped, and their Undo says so. Known by the list's value, not by a flag a caller must set.
    const noted = () => { live.current.produced.set(listId, list(drafted())); };
    const settle = () => {
      const p = live.current.produced;
      if (p.has(listId) && p.get(listId) !== list(drafted())) {
        live.current.backs = BtPutBacks.dropped(live.current.backs, listId);
        p.delete(listId);
      }
    };
    const changed = (fn, keys) => { settle(); const taken = update(fn, keys); if (taken) noted(); return taken; };
    return {
      canAdd: (list(now) || []).length < max,
      row: (i) => (name ? { "data-rec-row": name(i) } : {}),
      add: () => {
        let at = -1;
        const taken = changed((d) => { if (list(d).length >= max) return d; at = list(d).length; return put(d, [...list(d), blank()]); }, own([]));
        if (taken && at >= 0 && name) setFocusOn({ row: name(at) });
        return taken;
      },
      setAt: (i, patch) => changed((d) => put(d, list(d).map((x, j) => (j === i ? { ...x, ...patch } : x))), own(keysOf(i))),
      // Answers the Undo it toasted (false when nothing was removed), for a body that offers the same Undo where the
      // row was: a sheet, whose Tab ring the toast is outside (record-sheet.jsx). Whichever is pressed first puts the row
      // back, once; the other then has nothing left to put back, and the row is where it was either way. Its `id` names
      // the put-back among `waiting()`. Where the row goes back is BtPutBacks': between the same two rows it went from.
      removeAt: (i, said) => {
        settle();
        const gone = latest()[i];
        if (gone === undefined) return false;
        // Every row after it moves up a place, and its sentences with it: they are all asked again at Save.
        const moved = latest().flatMap((_, j) => (j >= i ? keysOf(j) : []));
        if (!changed((d) => put(d, list(d).filter((_, j) => j !== i)), own(moved))) return false;
        live.current.seq += 1;
        const id = live.current.seq;
        live.current.backs = BtPutBacks.taken(live.current.backs, listId, i, { id, row: gone });
        const opening = live.current.opening;
        // Read as it runs: its place has moved with every change since. What goes back is a copy, so a row put back
        // counts as changed wherever "changed" is told by identity (the services sheet's search never hides one).
        const back = undo((d) => {
          const w = BtPutBacks.find(live.current.backs, id);
          return put(d, [...list(d).slice(0, w.at), { ...gone }, ...list(d).slice(w.at)]);
        });
        let done = false;
        const again = () => {
          if (done) return true;
          // From an earlier opening, or once the editor has closed, that is what it says, before anything about the
          // list it no longer belongs to (the quality review's P2: it said the list was full).
          if (!live.current.open || live.current.opening !== opening) return back();
          settle();
          if (!BtPutBacks.find(live.current.backs, id)) { flash({ tone: "warn", msg: <>{BT_UNDO_REPLACED}</> }); return false; }
          if (latest().length >= max) { if (full) flash({ tone: "warn", msg: <>Not put back — {full}</> }); return false; }
          if (!back()) return false;
          done = true;
          noted();
          live.current.backs = BtPutBacks.restored(live.current.backs, id);
          return true;
        };
        live.current.agains.set(id, again);
        again.id = id;
        flash({ msg: typeof said === "function" ? said(gone) : said, undo: again });
        return again;
      },
      // The rows of this list an Undo may still put back, in the list's order: { id, at, row, back }. `at` is how many
      // of the list's rows come before it now, which is where a body draws the Undo it offers in the row's place.
      waiting: () => {
        settle();
        return BtPutBacks.of(live.current.backs, listId).map((b) => ({ id: b.id, at: b.at, row: b.row, back: live.current.agains.get(b.id) }));
      },
    };
  };
  const press = (fn) => ({
    "aria-disabled": busy || undefined,
    onClick: (e) => { if (busy) { if (e && e.preventDefault) e.preventDefault(); return; } fn(e); },
  });
  const close = () => { reset(); fold.close(); };
  const refused = !!(gate && gate["aria-disabled"]);
  const asks = btAsks({ ask, fold, prefix, busy, dirty, close, reset });
  const submit = () => {
    if (busy || !open || refused) return;
    if (draft == null) { close(); return; }
    // The checks are the helpers', and a draft they throw on is one they cannot judge: said, in the danger tone, and
    // nothing sent. `judged` is what to do next; null is a check that could not run.
    const judged = btWorkedOut(`whether the ${id} fold may be saved`, () => {
      const own = S.problemsOf(id, draft);
      if (Object.keys(own).length) return { problems: own };
      if (!S.holdsChanges(id, base, draft)) return { nothing: true };
      const all = S.saveProblems(id, base, draft);
      if (Object.keys(all).length) return { problems: all };
      return { job: S.foldJob(id, draft, { opened: live.current.opened, said, done: close, flash }) };
    });
    if (!judged) { flash({ tone: "danger", msg: <>{BT_UNCHECKED}</> }); return; }
    if (judged.problems) { setProblems(judged.problems); return; }
    if (judged.nothing) { close(); return; }
    if (ask.armed) ask.disarm();
    saver.save(judged.job);
  };

  // What it will say is worked out as it draws, so it is tried: a draft the helpers throw on draws no block.
  const will = open && channel ? btWorkedOut(`what the ${id} fold will say`, () => (
    Object.keys(S.problemsOf(id, now)).length ? null : S.willSay({ was: base.brain, next: S.saveFold(id, base, now).brain, sections: id, channel })
  )) : null;

  // What a body is handed (BtFold's contract says each). `focus(row)` puts focus in the first box of the row the body
  // named `row` (its data-rec-row), as an added row takes it; `opened` is the draft the editor opened with, and
  // `opening` counts the times it has opened, so what a body keeps of its own for one opening (a sheet's search, the
  // rows it has taken out) is known to be from an earlier one.
  const fields = {
    draft: now, open, problems: found, readOnly: busy, update, change, rows, press,
    focus: (row) => setFocusOn({ row }), opened: live.current.opened, opening: live.current.opening,
  };
  return { open, busy, stored, fields, will, asks, submit, focusOn, request: fold.request };
};

/* ------------------------------------ a set of fields, under the row that states them ------------------------------------ */

/**
 * One of this page's folds: at rest a RecordRow, and while it is edited the kit's fold (RecordFold, record-fold.jsx),
 * which holds the gesture itself -- its focus, its keys, what saving writes and its foot. What is the page's is the
 * editor (useBtEditor, above), once, for every fold and the sheet: the draft, what stops a save, the save through the
 * tab's one saver, what the receptionist will be told, and the two asks. A card draws its fields (`body`) and what its
 * row says at rest (`row`); nothing else.
 *
 * `body` draws the fields. It is drawn on every render, open or not: a body may hold hooks (a menu, a field's id), and
 * the tests' stub React keeps every hook on the page as a cell in one order (this file's header). So a body whose rows
 * come and go draws them hookless. It is handed all of this, and takes nothing else from its card, `flash` least of all:
 *   draft                 the draft as it stands: what is stored, while the fold is closed;
 *   open                  whether the fold is open, for a body that draws less while it is not;
 *   problems              what stopped the last Save, by field key;
 *   readOnly              the fold's save is out: every box takes it (record-fold.jsx says why);
 *   update(fn, keys)      the draft as `fn` makes it of the LATEST one. `keys` are the field keys whose sentences the
 *                         change answers; left out, all of them. It ANSWERS WHETHER IT TOOK THE CHANGE: while the save
 *                         is out it takes none, and whoever would say "Removed…" says it only of a change that was made;
 *   change(fn, words)     a change that is said: taken, it toasts `words.said`, with an Undo when `words.back` is given
 *                         (the draft as `back` makes it of the latest one; it does nothing once the fold has closed,
 *                         since the draft it would put something back into went with it). Refused, it says nothing: a
 *                         body that toasted for itself said "Removed the Mon shift at 14:00", with an Undo, of a shift
 *                         that was still there. `words.keys` as for update;
 *   rows(list)            a list inside the draft, with every rule a list has, ONCE: see below;
 *   press(fn)             the props of a press that changes the draft (an add, a remove). While the fold saves it
 *                         refuses the way Save does: focusable, aria-disabled (never `disabled`, which lets go of
 *                         focus), and doing nothing:  <button type="button" {...press(() => shifts.removeAt(n, said))}>
 *   focus(row)            focus to the first box of the element the body spread `data-rec-row={row}` on;
 *   opened, opening       the draft it opened with, and how many times it has opened (useBtEditor says why).
 *
 * `rows({ id, name, max, blank, keysOf, key, full, list, put })` answers { canAdd, add(), setAt(i, patch), removeAt(i,
 * said), waiting(), row(i) } for one list of the draft, named by `id`, which is required ("closures", one day's
 * "hours-mon", "services"): the closed days (the draft itself), or one day's shifts (`list`
 * reads it out of the draft and `put` writes it back; left out, the draft is the list). Each body once had to remember
 * all of this, and the cap was forgotten in the one place nobody looks: a toast's Undo put a fifth shift on a Monday
 * that takes four.
 *   the cap        `max`, in all three places: `canAdd` is what the body offers Add by, `add()` appends `blank()` only
 *                  while there is room, and a removed row is PUT BACK only while there is room, the Undo saying `full`
 *                  when there is not;
 *   the removal    the row is captured from the latest draft before it goes, comes back between the same two rows it
 *                  went from, whatever else was taken out or put back since, and `said(row)` is toasted only when the
 *                  change was taken. removeAt answers the toast's Undo itself (false when nothing went), for a body
 *                  that offers it where the row was too; either puts it back once. `waiting()` is every row an Undo may
 *                  still put back, in the list's order, each with where it would go (`at`);
 *   the sentences  `keysOf(i)` are row i's field keys and `key` the list's own (too many). A change to row i answers
 *                  its keys; a removal moves every later row up a place, so it answers them all;
 *   the focus      `name(i)` names row i, and the body spreads `row(i)` on the element that holds its boxes. A row that
 *                  was just added takes focus in its first box (the kit's useRecFocus, through RecordFold's focusOn):
 *                  it stayed on Add.
 * The caps themselves are business-tab-folds.jsx's LIMITS, which the save's checks read too. A list is changed through
 * rows(), never through `update`: rows() is where the cap, the Undo and the index live, and a body that added or
 * removed a row with `update` had none of the three.
 *
 * `row` is what the row at rest draws: { value, empty, hint, wrong, children, act, name }. `act` and `name` replace the
 * act's words and its name where "Change" or "Add one" and the label say nothing together.
 */
const BtFold = ({
  id, label, hint = null, row = {}, wide = false, saveLabel = "Save", said = BT_SAVED, footNote = null, channel = "whatsapp",
  canEdit = true, gate = null, flash = () => {}, saver = null, body,
}) => {
  const e = useBtEditor({ id, canEdit, gate, flash, saver, said, channel, prefix: `rec-fold-${id}` });
  const found = e.fields.problems;
  const has = !(row.value == null || row.value === "" || row.value === false);
  return (
    <>
      {e.open ? null : (
        <window.RecordRow
          id={id}
          label={label}
          value={row.value}
          empty={row.empty}
          hint={row.hint}
          wrong={row.wrong}
          act={canEdit && e.stored ? { label: row.act || (has ? "Change" : "Add one"), name: row.name || undefined, onClick: () => e.request(), gate } : null}
        >
          {row.children || null}
        </window.RecordRow>
      )}
      <window.RecordFold
        id={id}
        label={label}
        hint={hint}
        open={e.open}
        wide={wide}
        says={e.will ? e.will.whole : null}
        saysLabel="Your receptionist will be told"
        gone={e.will ? e.will.removed : null}
        goneLabel="It will no longer be told"
        note={e.will ? e.will.note : null}
        footNote={footNote}
        focusOn={e.focusOn}
        confirm={e.asks.confirm}
        onSave={e.submit}
        onCancel={e.asks.cancel}
        saving={e.busy}
        saveLabel={saveLabel}
        gate={gate}
      >
        {/* With no draft to hand it (btWorkedOut, above) the body is not drawn: it would throw on nothing. */}
        {e.stored ? body(e.fields) : null}
        {/* A refusal that is not this fold's to fix (a stored day that closes before it opens, met while saving the
            closures) stops this save too, and is said once, here, naming where. */}
        <window.FieldError id={`bt-${id}-elsewhere`} message={found.elsewhere || null} testid={`rec-fold-${id}-elsewhere`} />
      </window.RecordFold>
    </>
  );
};

/* ------------------------------------ a list you scroll, beside the page ------------------------------------ */

/**
 * One of this page's sheets: the kit's RecordSheet (record-sheet.jsx), a modal dialog beside the page (from the bottom,
 * on a phone), over the same editor a fold is (useBtEditor): the one open at a time, the asks, the draft, the checks,
 * the one job and the saver. It is not a fold, and the registry opens it just the same: it holds the registry under its
 * id as a fold does (useRecordFold, inside the editor), and is open while the registry says so. So opening it with a
 * fold open asks about that fold's changes, opening a fold with it open asks about its own, and the standing line's
 * door opens it by its id, guarded like any row.
 *
 * It has no row of its own. A card draws the row that states the list, whose act asks the registry for this id
 * (window.__recordFolds.request); the page draws the sheet.
 *
 * The page draws it LAST of everything on it that holds a hook. It holds its editor's hooks on every draw, and the kit's
 * RecordSheet holds more and is drawn only while it is open, and the tests' stub React keeps every hook on the page as
 * a cell in one order (this file's header): a component with hooks that appears drawn before another's shifts every
 * cell after it, so a sheet drawn before a card read that card's cells as its own. Drawn after every card, only the tail
 * of the order comes and goes. Its rows are drawn hookless for the same reason: they come and go before RecordSheet's
 * own hooks.
 *
 * Escape and the head's Close are the foot's Cancel, with its ask: nothing typed is thrown away unasked, and nothing
 * cancels a save that is out; Ctrl or Cmd with Enter saves. The foot, its asks and its keys are the kit's, as a fold's
 * are (RecordSheet takes RecordFold's foot props), drawn in the sheet, above its Save, since Tab never leaves a modal
 * dialog.
 * `tools(fields)`, `body(fields)` and `told(fields)` are the page's: the strip above the rows, the rows, and a line of
 * its own above the foot (what it will be told); each is handed what a fold's body is (BtFold's contract) and `will`,
 * what willSay answers. `saveLabel` is words, or a function of the fields. Nothing of them is drawn while it is closed.
 */
const BtSheet = ({
  id, title, sub = null, className = "", saveLabel = "Save", said = BT_SAVED, footNote = null, channel = "whatsapp",
  canEdit = true, gate = null, flash = () => {}, saver = null, tools = null, told = null, body,
}) => {
  const e = useBtEditor({ id, canEdit, gate, flash, saver, said, channel, prefix: `rec-sheet-${id}` });
  // The registry counts what is on the page by id, and lets go of the open id when the last of them goes, as it does for
  // a fold (record-fold.jsx drawn). The sheet is drawn only while it is open, so this, which is drawn on every draw, is
  // what the page's going takes with it: the rail's "Yes, leave" left the sheet the open one, and it opened again by
  // itself when the tab was next drawn.
  useBtgEffect(() => (window.__recordFolds && window.__recordFolds.drawn ? window.__recordFolds.drawn(id) : undefined), [id]);
  if (!e.open || !e.stored) return null;
  const f = { ...e.fields, will: e.will };
  // The foot is the kit's, as a fold's is (RecordSheet takes RecordFold's foot props): Save and Cancel, the ask above
  // them and not while the save is out. What is the page's above it: what it will be told, and a refusal that is not
  // this list's to fix, said once, as a fold says it.
  return (
    <window.RecordSheet
      id={id}
      title={title}
      sub={sub}
      className={className}
      onClose={e.asks.cancel}
      focusOn={e.focusOn}
      tools={tools ? tools(f) : null}
      foot={(
        <>
          {told ? told(f) : null}
          <window.FieldError id={`bt-${id}-elsewhere`} message={f.problems.elsewhere || null} testid={`rec-sheet-${id}-elsewhere`} />
        </>
      )}
      onSave={e.submit}
      saving={e.busy}
      saveLabel={typeof saveLabel === "function" ? saveLabel(f) : saveLabel}
      gate={gate}
      footNote={footNote}
      confirm={e.asks.confirm}
    >
      {body(f)}
    </window.RecordSheet>
  );
};

/**
 * Whether the sheet `id` could open over the saver's base: a read to save onto, and a draft its part of the record can
 * be worked out as. The editor's own test (btOpening, which useBtEditor asks), for the row that opens a sheet the page
 * draws elsewhere, last: a fold offers no act while its draft cannot be worked out, and the row that opens a sheet
 * offered one that opened nothing.
 */
BtSheet.opens = (id, saver) => btOpening(id, saver).can;

// The three gestures, the put-backs every list of them keeps (BtPutBacks, published for its own tests), and the words
// every row of words says once its change is saved, for the cards that live in files
// of their own and read them as they draw.
Object.assign(window, { BtRow, BtFold, BtSheet, BtPutBacks, BT_SAVED });
