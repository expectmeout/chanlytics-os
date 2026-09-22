/* global React, Icon */
// Chanlytics — Settings › Business, as a record.
//
// The tab was two surfaces that disagreed about what exists: a card showing nine facts, and a form editing about
// twenty-five behind one Save. Here every fact is a row, and a row is edited where it is stated
// (docs/superpowers/specs/2026-09-20-business-tab-design.md; the canvas's Record, Group-Who and Edit-Inline boards).
// This file draws the head, the standing line and *Who you are*, and holds the page's two gestures: a row edited in
// its place (BtRow) and a set of fields folded open under its row (BtFold). *When you're open* is
// pages/business-tab-open.jsx, which loads before this file and is read from window as the page draws. The other groups
// arrive with Tasks 3.4 and 3.5, and PaneWorkspace (settings.jsx) keeps drawing the old card until Task 3.7 swaps this
// page in.
//
// The page composes and never derives. Every sentence with a number or a judgement in it is contracts', through
// window.__businessTab (legacy-bridge/business-tab.ts); every fact is the settings read's (window.__SETTINGS,
// window.__FACTS), read as the page draws. What a save writes is pages/business-tab-save.jsx's, through
// window.__businessTabSave: each row's check and patch, and the tab's one saver. That file loads before this one.
//
// The tests' stub React (tooling/scripts/tests/_legacy-react.mjs) keeps every hook on the page as a cell in one order,
// so a component holding hooks that is drawn on one render and not the next moves every cell after it. So every
// component here that holds one is drawn on every render (an inline editor that is closed is `hidden`, as a closed
// RecordFold is), and what comes and goes (a row at rest, a Confirm, a note) holds none. That is the stub's rule, not
// React's, which keeps each component's hooks with the component: nothing here needs shaping further for React's sake.
// And no object rest in a pattern anywhere in this file: the standalone mockup compiles every file into one global
// scope, where Babel's `_excluded` for a rest is shared, and the last file compiled decides what every earlier rest
// leaves out (record-field.jsx says how that bit).

const { useState: useBizState, useEffect: useBizEffect, useRef: useBizRef } = React;

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
  const [armed, setArmed] = useBizState(false);
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
  const [draft, setDraft] = useBizState(null);
  const [problem, setProblem] = useBizState(null);
  const ask = useBtAsk();
  // What the registry reads when it asks whether this row holds changes. A keystroke lands here as it is typed, so a
  // press on another row straight after typing is asked about even before the page has drawn again.
  const live = useBizRef({ draft: null, initial: null, storedAs, open: false });
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
  useBizEffect(() => { if (!open) reset(); }, [open]);

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
  // the other answer is information rather than a fill (btDispute's `use` is null).
  const other = disputed ? {
    value: disputed.value,
    source: disputed.source,
    severity: disputed.severity,
    sentence: disputed.sentence,
    useLabel: disputed.useLabel,
    onUse: canEdit && disputed.use != null ? () => {
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

/* ------------------------------------ a set of fields, under the row that states them ------------------------------------ */

/**
 * One of this page's folds: at rest a RecordRow, and while it is edited the kit's fold (RecordFold, record-fold.jsx),
 * which holds the gesture itself -- its focus, its keys, what saving writes and its foot. What is the page's is here,
 * once, for every fold: the draft, what stops a save, the save through the tab's one saver, what the receptionist
 * will be told, and the two asks. A card draws its fields (`body`) and what its row says at rest (`row`); nothing else.
 *
 * It follows business-tab-folds.jsx's contract to the letter, because a fold that did not would lose a colleague's
 * change or a workspace's prompt without a word:
 *   as it opens     the draft is draftOf(id, saver.base()), kept as `opened`. Until the fold is typed in, `opened` is
 *                   taken again from the base on every draw: an untouched fold FOLLOWS what is stored, so a colleague's
 *                   change read back into this tab is shown as it stands, said as nothing that goes, and the first
 *                   keystroke after it is a change to the week as it is now, not a save refused as "changed after you
 *                   opened it". Typed in, or while its save is out, `opened` holds still, and foldJob's refusal stands;
 *   unsaved changes the draft is not the one it opened with, asked by the registry however the fold was opened (its own
 *                   act, or its id from the standing line's door), by the Settings rail, by the browser, and by Cancel.
 *                   NOT holdsChanges, which judges what the save would WRITE: a shift typed half-way, a closed day's
 *                   note with no date yet, a day switched on with no times and (Task 3.4) a service with no name are
 *                   all dropped by the save, so they read as nothing, and Cancel threw them away without a question.
 *                   The form this replaces counted any change, and so does this. Asking once too often loses nothing;
 *   on Save         the page's own checks first (problemsOf), each sentence under its field: a shift typed half-way is
 *                   dropped by the save, so a week that "changes nothing" because of one must still be refused, never
 *                   closed as if saved. Then nothing to write (holdsChanges, which stays the test for whether Save
 *                   sends anything) is nothing to send, and the fold closes. Then the save's
 *                   own schema (saveProblems). Only then saver.save(foldJob(...)), never a hand-written patch. A fold
 *                   nobody typed in closes at once: nothing was asked of it, so nothing of it is judged (a non-owner's
 *                   calendar address arrives masked, and would be refused as no address at all);
 *   it will say     willSay on saveFold(id, saver.base(), draft).brain, only while it is open and only for a draft the
 *                   page's own checks pass: the whole block under "Your receptionist will be told", the lines that go,
 *                   and the sentence for a save that crosses the resolver's line. `channel` null draws none (the
 *                   calendar's address and the zone are in no draft of the brain).
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
 *
 * `rows({ name, max, blank, keysOf, key, full, list, put })` answers { canAdd, add(), setAt(i, patch), removeAt(i, said),
 * row(i) } for one list of the draft: the closed days (the draft itself), or one day's shifts (`list` reads it out of the draft and
 * `put` writes it back; left out, the draft is the list). Each body once had to remember all of this, and the cap was
 * forgotten in the one place nobody looks: a toast's Undo put a fifth shift on a Monday that takes four.
 *   the cap        `max`, in all three places: `canAdd` is what the body offers Add by, `add()` appends `blank()` only
 *                  while there is room, and a removed row is PUT BACK only while there is room, the Undo saying `full`
 *                  when there is not;
 *   the removal    the row is captured from the latest draft before it goes, comes back at its own index, and
 *                  `said(row)` is toasted only when the change was taken;
 *   the sentences  `keysOf(i)` are row i's field keys and `key` the list's own (too many). A change to row i answers
 *                  its keys; a removal moves every later row up a place, so it answers them all;
 *   the focus      `name(i)` names row i, and the body spreads `row(i)` on the element that holds its boxes. A row that
 *                  was just added takes focus in its first box (the kit's useRecFocus, through RecordFold's focusOn):
 *                  it stayed on Add.
 * The caps themselves are business-tab-folds.jsx's LIMITS, which the save's checks read too.
 *
 * `row` is what the row at rest draws: { value, empty, hint, wrong, children, act, name }. `act` and `name` replace the
 * act's words and its name where "Change" or "Add one" and the label say nothing together.
 */
const BtFold = ({
  id, label, hint = null, row = {}, wide = false, saveLabel = "Save", said = BT_SAVED, footNote = null, channel = "whatsapp",
  canEdit = true, gate = null, flash = () => {}, saver = null, body,
}) => {
  const S = window.__businessTabSave;
  const [draft, setDraft] = useBizState(null);
  const [problems, setProblems] = useBizState(null);
  const ask = useBtAsk();
  // The row a list was just given, for the kit to put focus in (rows' add).
  const [focusOn, setFocusOn] = useBizState(null);
  // What the registry, an Undo and a keystroke read: the latest draft, whatever the page has drawn since.
  const live = useBizRef({ draft: null, opened: null, open: false, opening: 0 });
  const busy = saver ? saver.pending(id) : false;
  const base = saver ? saver.base() : null;
  // Anything typed is something to ask about, whether or not the save would write it (the header says why).
  const holds = () => {
    const l = live.current;
    return !!(l.open && l.draft != null && !S.same(l.draft, l.opened));
  };
  const fold = window.useRecordFold(id, { dirty: holds, saving: () => !!(saver && saver.pending(id)) });
  // The draft as what is stored opens it, which the body is drawn with while the fold is closed. Tried, like everything
  // else here that is worked out as the fold draws (btWorkedOut): a fold whose part of the record cannot be read has no
  // editor and offers no act, and its row still says what it says.
  const stored = btWorkedOut(`the draft the ${id} fold opens with`, () => ({ draft: S.draftOf(id, base || {}) }));
  // A role that may not change the business never has an editor, whatever asked for one; nor does a page with nothing
  // read to save onto.
  const open = fold.open && canEdit && !!base && !!stored;
  // Closed by anything -- saved, cancelled, or given way to another row -- the draft goes with it, and the next
  // opening starts from what is stored.
  const reset = () => { live.current.draft = null; live.current.opened = null; setDraft(null); setProblems(null); ask.disarm(); setFocusOn(null); };
  useBizEffect(() => { if (!open) reset(); }, [open]);
  if (open && live.current.opened == null) live.current.opening += 1;
  // Untouched and not saving, the fold opens with what is stored NOW (the header says why); typed in, what it opened
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
  const undo = (fn) => {
    const at = live.current.opening;
    return () => (live.current.open && live.current.opening === at ? update(fn) : false);
  };
  const change = (fn, words = {}) => {
    if (!update(fn, words.keys)) return false;
    if (words.said) flash({ msg: words.said, undo: words.back ? undo(words.back) : undefined });
    return true;
  };
  const rows = ({ name = null, max = Infinity, blank = () => ({}), keysOf = () => [], key = null, full = null, list = (d) => d, put = (d, l) => l }) => {
    const latest = () => list(live.current.draft != null ? live.current.draft : live.current.opened) || [];
    const own = (keys) => (key ? keys.concat([key]) : keys);
    return {
      canAdd: (list(now) || []).length < max,
      row: (i) => (name ? { "data-rec-row": name(i) } : {}),
      add: () => {
        let at = -1;
        const taken = update((d) => { if (list(d).length >= max) return d; at = list(d).length; return put(d, [...list(d), blank()]); }, own([]));
        if (taken && at >= 0 && name) setFocusOn({ row: name(at) });
        return taken;
      },
      setAt: (i, patch) => update((d) => put(d, list(d).map((x, j) => (j === i ? { ...x, ...patch } : x))), own(keysOf(i))),
      removeAt: (i, said) => {
        const gone = latest()[i];
        if (gone === undefined) return false;
        // Every row after it moves up a place, and its sentences with it: they are all asked again at Save.
        const moved = latest().flatMap((_, j) => (j >= i ? keysOf(j) : []));
        if (!update((d) => put(d, list(d).filter((_, j) => j !== i)), own(moved))) return false;
        const back = undo((d) => put(d, [...list(d).slice(0, i), gone, ...list(d).slice(i)]));
        flash({
          msg: typeof said === "function" ? said(gone) : said,
          undo: () => {
            if (live.current.open && latest().length >= max) { if (full) flash({ tone: "warn", msg: <>Not put back — {full}</> }); return false; }
            return back();
          },
        });
        return true;
      },
    };
  };
  const press = (fn) => ({
    "aria-disabled": busy || undefined,
    onClick: (e) => { if (busy) { if (e && e.preventDefault) e.preventDefault(); return; } fn(e); },
  });
  const close = () => { reset(); fold.close(); };
  const refused = !!(gate && gate["aria-disabled"]);
  const asks = btAsks({ ask, fold, prefix: `rec-fold-${id}`, busy, dirty, close, reset });
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

  // What it will say is worked out as the fold draws, so it is tried: a draft the helpers throw on draws no block.
  const will = open && channel ? btWorkedOut(`what the ${id} fold will say`, () => (
    Object.keys(S.problemsOf(id, now)).length ? null : S.willSay({ was: base.brain, next: S.saveFold(id, base, now).brain, sections: id, channel })
  )) : null;

  const has = !(row.value == null || row.value === "" || row.value === false);
  return (
    <>
      {open ? null : (
        <window.RecordRow
          id={id}
          label={label}
          value={row.value}
          empty={row.empty}
          hint={row.hint}
          wrong={row.wrong}
          act={canEdit && stored ? { label: row.act || (has ? "Change" : "Add one"), name: row.name || undefined, onClick: () => fold.request(), gate } : null}
        >
          {row.children || null}
        </window.RecordRow>
      )}
      <window.RecordFold
        id={id}
        label={label}
        hint={hint}
        open={open}
        wide={wide}
        says={will ? will.whole : null}
        saysLabel="Your receptionist will be told"
        gone={will ? will.removed : null}
        goneLabel="It will no longer be told"
        note={will ? will.note : null}
        footNote={footNote}
        focusOn={focusOn}
        confirm={asks.confirm}
        onSave={submit}
        onCancel={asks.cancel}
        saving={busy}
        saveLabel={saveLabel}
        gate={gate}
      >
        {/* With no draft to hand it (btWorkedOut, above) the body is not drawn: it would throw on nothing. */}
        {stored ? body({ draft: now, open, problems: found, readOnly: busy, update, change, rows, press }) : null}
        {/* A refusal that is not this fold's to fix (a stored day that closes before it opens, met while saving the
            closures) stops this save too, and is said once, here, naming where. */}
        <window.FieldError id={`bt-${id}-elsewhere`} message={found.elsewhere || null} testid={`rec-fold-${id}-elsewhere`} />
      </window.RecordFold>
    </>
  );
};

/** The box for a row whose value is one line of text. */
const btTextBox = (words) => ({ draft, set, problem, field }) => (
  <window.RecordField
    {...field}
    value={draft}
    onChange={set}
    problem={problem}
    hint={words.hint || null}
    placeholder={words.placeholder}
    inputMode={words.inputMode}
    autoComplete={words.autoComplete}
  />
);

/**
 * A disagreement on a row, from what the settings read resolved: the other answer (facts.ts `disputed`) and the
 * resolver's sentence and severity for it (factConflicts). `take` turns the other answer into the draft that takes it,
 * and `take.from`, where it is given, names the sources whose answer may be taken; from any other, the disagreement is
 * information, drawn with no press (`use` is null). Nothing offers "keep mine": nothing stores that choice, and a press
 * that stores nothing would say the disagreement was settled while the database still holds it.
 */
const btDispute = (f, conflict, take) => {
  const theirs = (f && f.disputed) || (conflict ? { value: conflict.known, source: conflict.knownSource } : null);
  if (!theirs) return null;
  const offered = !take.from || take.from.includes(theirs.source);
  return {
    value: theirs.value,
    source: theirs.source,
    severity: conflict ? conflict.severity : undefined,
    sentence: conflict ? conflict.sentence : null,
    useLabel: take.label || null,
    use: offered ? take.draft(theirs.value) : null,
  };
};
const BT_TAKE_THEIRS = { draft: (v) => v };
// The name Google lists may be taken in one press. The workspace's own name may not: it is whatever the workspace was
// called when it was made -- a Stripe test's "Billing probe" once went to the carriers as a business's name
// (business-page.ts) -- and a press that renamed the business to it would put that name in front of customers.
const BT_TAKE_GOOGLES = { draft: (v) => v, from: ["verified"] };

/* ------------------------------------ the page ------------------------------------ */

/** The page's name, what it is, and who last changed it (the row's own author and stamp, 00085). */
const BtHead = () => {
  const changed = window.__lastChanged ? window.__lastChanged() : "";
  return (
    <header className="bt-head" data-testid="bt-head">
      <h1 className="bt-title">Business</h1>
      <p className="bt-sub">What both receptionists answer from.{changed ? ` ${changed}.` : ""}</p>
    </header>
  );
};

/**
 * Three clauses, not a meter (spec §4.1): what it can say, what it will not, and the one gap most worth closing, which
 * is the door to the row that closes it. Every word is contracts' (standingLine): the gap's own sentence is its door.
 * A role that may not change the business reads the gap and gets no door, since the row behind it would not open.
 *
 * The door is named by its sentence and then by what it does, which is the act of the row it opens: "It cannot say
 * where you are. Add one Address", in the row's own words and label (RecordRow's ids), so a screen reader hears where
 * it goes and not only a statement. A row not on the page yet adds nothing to the name, and the sentence stands alone.
 */
const BtStanding = ({ brain, door }) => {
  const tab = window.__businessTab;
  if (!tab || !tab.standingLine) return null;
  const vm = tab.standingLine(brain);
  const gap = vm.missing;
  return (
    <section className="bt-standing" data-testid="rec-standing" data-state={gap ? "warn" : "ok"}>
      <span className="bt-standing-dot" aria-hidden="true" />
      <div className="bt-standing-words">
        <p className="bt-standing-can">{vm.can}</p>
        {vm.wont || gap ? (
          <p className="bt-standing-more">
            {vm.wont}
            {vm.wont && gap ? " " : null}
            {gap && door ? (
              <button
                type="button"
                className="bt-standing-door"
                onClick={() => door(gap.row)}
                aria-labelledby={`bt-standing-door-words rec-row-${gap.row}-act rec-row-${gap.row}-key`}
                data-testid="rec-standing-door"
              >
                <span id="bt-standing-door-words">{gap.sentence}</span>
              </button>
            ) : gap ? (
              <span className="bt-standing-gap">{gap.sentence}</span>
            ) : null}
          </p>
        ) : null}
      </div>
    </section>
  );
};

/**
 * A door opens a row by its id, as the row's own act would open it: the registry holds each row's dirty test by id,
 * bound as the row's hook mounted (record-fold.jsx), so a row opened from here asks before its changes are thrown away
 * like any other, and one open elsewhere holding changes is asked about first. A row this page does not draw yet (the
 * services and the voice arrive with Tasks 3.4 and 3.5) opens, guarded the same way, once its fold is here.
 */
const btOpenRow = (id) => {
  if (window.__recordFolds) window.__recordFolds.request(id);
};

/**
 * Who you are (spec §4.2): the seven facts a customer asks for by name, each with where it came from, and the
 * disagreements factConflicts finds drawn on the row each is about, where the banner above the card used to hold them.
 *
 * The Workspace row is gone. It printed the business's name a second time whenever the workspace's name differed: two
 * names for one business, on the one card that exists to say which name customers hear.
 */
const BtWho = ({ brain, base = null, canEdit, flash, saver }) => {
  const F = ((window.__FACTS || {}).facts) || {};
  const conflicts = ((window.__FACTS || {}).conflicts) || [];
  const conflictOn = (key) => conflicts.find((k) => k.fact === key) || null;
  const profile = brain.profile || {};
  // The brain the rows' saves go on (the saver's base), which is what they will say is worked out on.
  const goesOn = (base && base.brain) || brain;
  // A fact as the settings read resolved it. A read that carried no facts (an older server) falls back to what is
  // typed in the brain, with no source claimed for it: a fact with no source is not a fact, but a stored value is
  // still what the receptionist says.
  const factOf = (key, typed) => F[key] || (typed ? { value: typed, source: null } : { value: null, source: null });
  const chip = (f) => (f.value ? f.source : null);
  const shared = { brain, base, canEdit, flash, saver };
  const gate = (thing) => window.gate("settings", `change the ${thing}`);
  // Each row's check and patch, and what its draft stores (business-tab-save.jsx).
  const S = window.__businessTabSave;
  const phoneShown = window.phoneShown;

  const name = factOf("business_name", brain.business_name);
  const address = factOf("address", profile.address);
  const website = factOf("website", profile.website);
  const link = factOf("booking_link", brain.booking_link);
  const line = F.voice_line || null;
  const voiceLine = (line && line.value) || "";
  const lineShown = phoneShown(voiceLine);
  const pub = factOf("phone_display", brain.phone_display);
  const transfer = factOf("handoff_number", profile.handoff_number);
  const handoff = transfer.value || null;

  // A row of words: its draft, trimmed, through the row's patch, and the words every such row says once it is saved.
  const words = (id) => (d) => ({ change: S.PATCH_OF[id](S.trimmed(d)), said: BT_SAVED });
  // The two numbers store what their own rules make of a draft, the one it gives out beside the line it answers.
  const published = (d) => S.STORED_AS.phone_display(d, voiceLine);
  const transferOf = S.STORED_AS.handoff_number;

  return (
    <section className="rec-card" data-testid="rec-card-who" aria-labelledby="bt-who-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-who-title">Who you are</h2>
        <span className="rec-card-sub">The facts a customer asks for by name</span>
      </div>

      <BtRow
        {...shared}
        id="name"
        // The line the prompt opens with, and the product's own lines where a rename writes them again (the name's patch),
        // decided on the brain the rename goes on, as the patch decides it.
        section={S.isBaseline(goesOn) ? ["business_name", "system_prompt"] : "business_name"}
        label="Name"
        value={name.value}
        empty="Not set"
        source={chip(name)}
        disputed={btDispute(name, conflictOn("business_name"), BT_TAKE_GOOGLES)}
        gate={gate("name")}
        initial={brain.business_name || ""}
        check={S.CHECK_OF.name}
        commit={words("name")}
        body={btTextBox({ placeholder: "The name customers know you by", autoComplete: "organization" })}
      />

      <BtRow
        {...shared}
        id="address"
        label="Address"
        value={address.value}
        empty="Not set"
        source={chip(address)}
        disputed={btDispute(address, conflictOn("address"), BT_TAKE_THEIRS)}
        gate={gate("address")}
        initial={profile.address || ""}
        commit={words("address")}
        body={btTextBox({ placeholder: "123 Example St, Brooklyn, NY 11208", autoComplete: "street-address", hint: "Given when someone asks how to find you." })}
      />

      <BtRow
        {...shared}
        id="website"
        label="Website"
        value={website.value}
        empty="Not set"
        // What empty means, and only what is exact: the prompt names a website only when one is typed here. Not that it
        // has none to give, since the owner's own words may name one. Nor what the canvas said, that empty sent
        // customers and the carriers to the page we publish, /b/<slug>: no receptionist is told that page, and the
        // carriers are filed the business record's own website (Connections), or that page when the record has none.
        hint={website.value ? null : "Optional. Left empty, the receptionist is given no website."}
        source={chip(website)}
        disputed={btDispute(website, conflictOn("website"), BT_TAKE_THEIRS)}
        gate={gate("website")}
        initial={profile.website || ""}
        check={S.CHECK_OF.website}
        commit={words("website")}
        body={btTextBox({ placeholder: "https://example.com", inputMode: "url", autoComplete: "url", hint: "Optional. Given when someone asks." })}
      />

      <BtRow
        {...shared}
        id="booking_link"
        label="Booking link"
        value={brain.booking_link || null}
        empty="Not set"
        // Said once, plainly, rather than discovered by a customer.
        hint="Sent instead of confirming an appointment itself."
        source={chip(link)}
        disputed={btDispute(link, conflictOn("booking_link"), BT_TAKE_THEIRS)}
        gate={gate("booking link")}
        initial={brain.booking_link || ""}
        check={S.CHECK_OF.booking_link}
        commit={words("booking_link")}
        body={btTextBox({ placeholder: "https://your-booking-page.com", inputMode: "url", autoComplete: "url", hint: "Sent instead of confirming an appointment itself." })}
      />

      {/* THREE numbers, named for what each one does. They were one row called "Phone line" showing a typed string,
          which is how a salon came to publish the number it transfers to as the number to call. The line it answers
          is provisioned and belongs to Connections, so it is shown here and never offered as a box; the other two are
          the receptionist's behaviour, edited in the row that states them. */}
      {/* The door is the row's act, with its own test id: it opens Connections, never a box, so it is not the row's
          Change. Named for where it goes and why, beginning with its own word, since its word and the row's label
          together ("Connections Answers on") say nothing. */}
      <window.RecordRow
        id="voice_line"
        label="Answers on"
        value={voiceLine ? lineShown : null}
        empty="No phone line yet"
        source={voiceLine ? line.source : null}
        act={{
          label: <>Connections <Icon name="arrow-right" size={10} /></>,
          name: "Connections, where the line it answers on is set up",
          onClick: () => window.CHANLY.nav("admin/integrations"),
          testid: "rec-row-door-voice_line",
        }}
      />

      {/* What the receptionist tells customers to call.

          Absent means "the line it answers", which is the answer for nearly every workspace and the one that stays
          right when the number changes. Publishing anything else is a deliberate act, and the note says what it costs
          -- because the live salon published its transfer number here and every customer who rang it reached a
          person's mobile instead of the receptionist standing by. */}
      <BtRow
        {...shared}
        id="phone_display"
        label="Tells customers to call"
        named="number customers are told to call"
        value={pub.value}
        empty="No number to give out"
        source={chip(pub)}
        disputed={btDispute(pub, conflictOn("phone_display"), { label: "Publish the line instead", draft: () => ({ own: true, typed: "" }) })}
        gate={gate("number customers are told to call")}
        initial={{ own: !brain.phone_display, typed: brain.phone_display || "" }}
        storedAs={published}
        check={(d) => S.CHECK_OF.phone_display(d, voiceLine)}
        commit={(d) => {
          const v = published(d);
          return {
            change: S.PATCH_OF.phone_display(v),
            said: v ? <>Customers are told to call <b className="tabular">{v}</b> now.</> : <>Customers are told to call your line.</>,
          };
        }}
        body={({ draft, set, problem, field, gate: pressable, readOnly }) => (
          <>
            {voiceLine ? (
              <window.RecordToggleGroup
                label="The number to tell customers to call"
                value={draft.own ? "line" : "other"}
                options={[{ value: "line", label: "Your line" }, { value: "other", label: "A different number" }]}
                onChange={(v) => set(v === "line" ? { own: true, typed: draft.typed } : { own: false, typed: draft.typed || lineShown })}
                readOnly={readOnly}
                gate={pressable}
                testid="rec-inline-phone_display-choice"
              />
            ) : null}
            <div className="bt-inline-box" hidden={draft.own && voiceLine ? true : undefined}>
              <window.RecordField
                {...field}
                value={draft.typed}
                onChange={(t) => set({ own: draft.own, typed: t })}
                problem={problem}
                placeholder={lineShown || "+1 646 932 5775"}
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            <span className="bt-inline-note" data-testid="rec-inline-phone_display-note">
              {draft.own && voiceLine
                ? <><b className="tabular">{lineShown}</b> — the line your receptionist answers. It follows the line, so changing your number changes nothing to keep in step.</>
                : window.__samePhone && window.__samePhone(draft.typed, voiceLine)
                  ? <>That is your line. Choose <b>Your line</b> and it stays right when the number changes.</>
                  : handoff && window.__samePhone && window.__samePhone(draft.typed, handoff)
                    ? <>This is the number the receptionist <b>transfers</b> to, so customers who ring it reach a person directly and never the receptionist answering on <b className="tabular">{lineShown}</b>.</>
                    : voiceLine
                      ? <>Customers who ring this will not reach your receptionist on <b className="tabular">{lineShown}</b>.</>
                      : <>The receptionist has no line of its own yet, so this is the number it gives out.</>}
            </span>
          </>
        )}
      />

      {/* Where a caller who insists on a person is transferred. Empty is a choice. Shown, and changed from, the way the
          row writes it: the check and the stored form both read "+1 (786) 555-0182". Its words are a call's, so what
          it will say is read on the phone: on WhatsApp the number changes nothing. And only where there is a line to
          call: a workspace that answers on WhatsApp alone is shown no sentence that no receptionist of its receives. */}
      <BtRow
        {...shared}
        id="handoff_number"
        label="Transfers a caller to"
        named="transfer number"
        channel={voiceLine ? "voice" : null}
        value={transfer.value ? phoneShown(transfer.value) : null}
        empty="Takes a message instead"
        source={chip(transfer)}
        disputed={btDispute(transfer, conflictOn("handoff_number"), BT_TAKE_THEIRS)}
        gate={gate("transfer number")}
        initial={phoneShown(profile.handoff_number) || ""}
        storedAs={transferOf}
        check={(d) => S.CHECK_OF.handoff_number(d, voiceLine)}
        commit={(d) => {
          const v = transferOf(d);
          return {
            change: S.PATCH_OF.handoff_number(v),
            said: v ? <>Callers who insist on a person reach <b className="tabular">{phoneShown(v)}</b>.</> : <>The receptionist takes a message instead of transferring.</>,
          };
        }}
        body={btTextBox({
          placeholder: "+1 646 932 5775",
          inputMode: "tel",
          autoComplete: "tel",
          hint: "A line a person answers, with the country code. Empty and the phone receptionist takes a message instead of transferring — which is better than a number nobody picks up.",
        })}
      />

      {/* Nothing is asked twice (spec §3): the carrier record is Connections', and this card only says where it is. */}
      <p className="bt-card-foot" data-testid="rec-who-foot">
        Your legal name and registered address are asked once on <button type="button" className="bt-link" onClick={() => window.CHANLY.nav("admin/integrations")}>Connections</button>, for the carriers. Nothing here repeats them.
      </p>
    </section>
  );
};

/**
 * Settings › Business, drawn from the settings read. A workspace with no brain -- none set up, or a config the parser
 * refused -- is PaneWorkspace's to draw, so the page draws nothing it cannot back.
 */
const BusinessTab = ({ flash = () => {} }) => {
  // The tab's one saver (business-tab-save.jsx), which outlives the page: a page drawn again on coming back to this tab
  // finds the save still out and the answer to the last one. A save moving through it draws the page again, busy or
  // done, for as long as the page is on screen.
  const [, setTick] = useBizState(0);
  const saver = window.__businessTabSave.saver;
  // And the zone's own door, which is the tab's for the same reason (business-tab-save.jsx): one effect hears both.
  const zone = window.__businessTabSave.zone;
  useBizEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const stops = [saver.subscribe(bump), zone ? zone.subscribe(bump) : null];
    return () => stops.forEach((stop) => { if (stop) stop(); });
  }, [saver, zone]);
  const settings = window.__SETTINGS || null;
  const brain = (settings && settings.config && settings.config.brain) || null;
  if (!brain) return null;
  const canEdit = !window.canDo || window.canDo("settings");
  // The config the next save goes on: what every row's "It will say" is worked out on.
  const base = saver.base();
  return (
    <>
      <BtHead />
      {/* A role that may not change the business reads all of it. Each row's act is absent rather than a dead button,
          so the page says why once, here. */}
      {canEdit ? null : (
        <p className="bt-viewer" data-testid="bt-viewer">
          <Icon name="shield" size={11} /> {window.gateTitle ? window.gateTitle("settings", "change the business") : ""} You can read everything.
        </p>
      )}
      <BtStanding brain={brain} door={canEdit ? btOpenRow : null} />
      <BtWho brain={brain} base={base} canEdit={canEdit} flash={flash} saver={saver} />
      {/* When you're open (business-tab-open.jsx), read from window as the page draws. */}
      {window.BtOpenCard ? <window.BtOpenCard brain={brain} config={settings.config} prompt={settings.prompt || null} canEdit={canEdit} flash={flash} saver={saver} /> : null}
    </>
  );
};

// BtRow and BtFold are the page's two gestures, for the cards that live in files of their own.
Object.assign(window, { BusinessTab, BtRow, BtFold });
