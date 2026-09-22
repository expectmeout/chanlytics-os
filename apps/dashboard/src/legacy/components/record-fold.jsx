/* global React, Icon */
// Chanlytics record kit: the fold and the inline editor, and the rule that only one is open.
//
// Two of the kit's three gestures (spec §5): the fold, a set of fields opened under the row that states them, and the
// inline editor, one value edited in its row (RecordInline, below RecordFold); the sheet is record-sheet.jsx. The two
// here share what they have in common rather than holding two copies of it: focus in as they open, back as they close,
// and back to where the person was when what held it leaves the page under it (useRecFocus); Escape and Ctrl or Cmd with Enter (recKeys); what
// saving writes (RecordSays); Save and Cancel (RecordFoot); and their hold on the registry (useRecDrawn).
//
// A set of fields opens under the row that states them. Its head keeps the row's label where it was and puts the
// page's hint where the value was; its act becomes Close. Under its fields, a fold can show what saving it will
// write, exactly as the inline editor does, through the one RecordSays: the lines it adds (`says`, under the page's
// own eyebrow, `saysLabel`), the lines it takes away (`gone`, under `goneLabel`), and a sentence of the page's before
// them (`note`) where the save reaches past its own lines. The fold once took only the first of the three, so a week
// emptied of its hours, the last field a record composed from, would have said nothing of the prompt it stops
// composing. Its foot carries its own Save and Cancel, and a line of the page's beside them (`footNote`: not `note`,
// which is RecordSays' sentence wherever the kit says it). The page decides what its fields are and what saving does;
// the kit knows none of it. Whether it is open comes from the registry, through useRecordFold (below): the `open` prop
// stays, but a fold drawn open without the registry holds no guard.
//
//   const rules = useRecordFold("booking_rules", { dirty: changed });
//   <RecordFold id="booking_rules" label="Booking rules" hint="…" open={rules.open} says={block} saysLabel="…"
//               onSave={save} onCancel={rules.close} saving={busy} gate={window.gate("settings", "change the booking rules")}>
//     …fields…
//   </RecordFold>
//
// Its fields, what saving writes and its foot sit under the value, past the label column the rows keep. A fold whose
// own grid carries a label column (a week's days, each named) is `wide`: its fields take the fold's whole width, and
// what saving writes and the foot keep the indent. record.css draws both.
//
// On a phone (the kit's one breakpoint, REC_PHONE_QUERY, kept current as the window changes size) an open fold is a
// sheet rising from the bottom instead (the canvas's Record-Phone): the sheet's own frame (record-sheet.jsx's classes,
// and record.css's phone sheet), holding the same head, fields, what saving writes and foot. It is a modal dialog named
// by the fold's label: Tab walks its own controls (data-bits trapTab), a press on the wash is Cancel, and Escape cancels
// from anywhere, since nothing outside it can hold focus a person means. Focus comes and goes by the fold's own rules
// (useRecFocus): to its first field as it opens, back to its row's act as it closes. The page never learns which frame
// drew it: the fold is called the same way, holds the same hooks in the same order, open or closed, at either width,
// and its registry, its asks and its save are the page's. A width crossed while it is open draws it again in the other
// frame, still open, with focus in its first field; what was typed is the page's, and stays.
//
// A page may draw a fold only while it is open, or keep it and flip `open`. Closed, it is `hidden`, whole: its head
// and its Close go with its fields, out of sight, the tab order and the accessibility tree, and the row it opens from
// is what shows. (`inert` would do the last two, but React 18 and 19 spell it differently; `hidden` they share.) Either
// way it unfolds as it appears (record.css, @starting-style).
//
// Escape cancels, unless something inside the fold took the key first (a combobox's list closing); Ctrl or Cmd
// with Enter saves. As it opens, focus moves to the first thing in it to type into or press, since the act that
// opened it has gone; as it closes, focus that went with it comes back to that row's act (data-rec-act).
//
// window.__recordFolds is the rule that only one fold is open, and it is what the Settings rail asks before it
// replaces a pane. A page asks it to open a fold with request(id), or request(id, { dirty }), where `dirty` says
// whether that fold holds unsaved changes once it is open. Without one, the fold's own is used: useRecordFold binds
// each fold's dirty test to its id as the fold mounts, so a fold opened from anywhere by its id alone (the Business
// tab's standing line opens a row it names) is guarded exactly as its own act would have guarded it.
// The registry keeps ONE dirty test per fold id: the one bound by the last useRecordFold hook to mount with that id.
// So a fold id belongs to one hook on the page. Two hooks drawing the same id would leave that id unguarded once the
// later of them unmounted, its test let go and the earlier's already replaced. The rebind this replaced let the last
// hook win the same way; it is a stated limit, not handled, because nothing draws a fold id twice. A clean fold
// gives way at once; a dirty one stays open and the registry records { holding, wants } until one of three answers:
// discard() (throw its changes away and open the one asked for), stay() (keep editing it), or close(id) from the
// holding fold itself (saved or cancelled; the one asked for then opens). If the fold asked for leaves the page first,
// the ask goes with it, and the holding fold stays open with its changes. close(id) from a fold that is not the open
// one does nothing. subscribe(fn) hears every change. A page reaches all of this through useRecordFold rather than by
// hand.
// A save in progress is not an open, unsaved editor. While the open fold's save is out (`saving`, the second test its
// hook binds), its fields are read-only (the page hands each of the kit's controls `readOnly`), what is asked of it
// waits, and nothing asks whether to discard what is on its way to the server: the box once stayed editable under
// "Saving…" and what was typed then went without a word when the save landed, and another row's "Discard your
// changes?" still asked, its yes stopping nothing. So a fold that is saving never gives way at once, whatever its
// dirty test says (a fold judged against the saver's base reads clean the moment its save goes out); the ask is
// recorded, the fold draws no question while it saves, and the save's answer is the answer: taken, the fold closes and
// the one asked for opens; refused, the question is drawn, and is true again. saving() says so to the Settings rail,
// which asks in other words (window.__settingsSaving), and the browser is asked to ask while a save is out too, since
// a tab closed over it may take the request with it.
// Three are not for pages: drawn(id) is RecordFold's own (it counts the folds with each id on the page, and when the
// last one with the open id goes, the registry lets go); bind(id, check, saves) is useRecordFold's (a fold's dirty
// test and its save-is-out test, by its id, for as long as the fold is on the page; a page drawn again hands over its
// own; one hook binds one of each for its life, so the test it binds is the test it hands its requests); and reset() is
// for tests (it forgets what is open and asked).

const { useRef: useFoldRef, useEffect: useFoldEffect, useState: useFoldState } = React;
// The sheet's leaving is put on the page before it paints (useRecLeaving), so a frame with no sheet at all is never
// seen; a stub React with no layout effect runs it as an effect.
const useFoldLayout = React.useLayoutEffect || React.useEffect;

const recFolds = (() => {
  let openId = null;
  let openDirty = null;
  let asked = null;
  const subs = new Set();
  // How many folds with each id are on the page. Counted by id, not held by each fold, because the fold a person
  // sees can be a new instance of the one that opened: StrictMode's check in development, a key change or a new
  // parent unmounts one and mounts the next in the same commit.
  const live = new Map();
  // Each fold's own dirty test, by its id, from the moment its hook mounts until it goes (bind). A request that brings
  // none uses it. Without it, a fold opened by its id alone held no test: the rail, another fold's act and the browser
  // would each have thrown its changes away without asking. One test per id, the last hook's to mount (the header
  // says why a fold id belongs to one hook).
  const bound = new Map();
  // Each fold's "my save is out" test, by its id, bound and let go of with its dirty test.
  const busy = new Map();
  // Work half-done that is not a fold -- a composer's words (useUnsavedWork, below). Each holds its own unsaved test
  // here while it is drawn, so the tab asks before closing over it and the rail before replacing it. A hold never
  // stands between two folds: request() asks the open fold alone.
  const holds = new Map();
  // A check that throws is taken as holding changes: asking once too often loses nothing.
  const holding = (check) => { try { return !!check(); } catch { return true; } };
  // "Nothing open" is null, never merely falsy: a fold may be called 0 or "". The open fold's test is the one its
  // request brought, else the one its hook bound.
  const foldDirty = () => {
    if (openId == null) return false;
    const check = typeof openDirty === "function" ? openDirty : bound.get(openId);
    return typeof check === "function" && holding(check);
  };
  const dirty = () => foldDirty() || [...holds.values()].some(holding);
  // Whether the open fold's save is out. A test that throws is taken as not saving: the dirty test still speaks.
  const saving = () => {
    if (openId == null) return false;
    const check = busy.get(openId);
    if (typeof check !== "function") return false;
    try { return !!check(); } catch { return false; }
  };
  // The browser asks before the tab closes over a dirty fold, over one whose save is out (the tab may take the request
  // with it), or over a composer's words. The listener is on only while a fold is open or a composer holds -- the form
  // the record replaced hung its own on only while it held changes -- and it asks at the moment the tab closes.
  const hold = (e) => { if (!dirty() && !saving()) return; e.preventDefault(); e.returnValue = ""; };
  // Each listener hears every change, whatever another does: one that throws is reported and the rest still hear.
  const tell = () => {
    window.removeEventListener("beforeunload", hold);
    if (openId != null || holds.size > 0) window.addEventListener("beforeunload", hold);
    for (const fn of [...subs]) {
      try { fn(); } catch (err) { if (window.console) window.console.error(err); }
    }
  };
  const become = (id, check) => {
    openId = id == null ? null : id;
    openDirty = typeof check === "function" ? check : null;
    asked = null;
    tell();
  };
  return {
    open: () => openId,
    dirty,
    saving,
    asking: () => (asked ? { holding: asked.holding, wants: asked.wants } : null),
    request(id, { dirty: given } = {}) {
      const check = typeof given === "function" ? given : bound.get(id);
      if (id === openId) {
        if (typeof check === "function") openDirty = check;
        asked = null;
        tell();
        return true;
      }
      // A fold whose save is out never gives way at once: the ask waits for the save's answer (the header says why).
      // A composer's hold does not stand between two folds: only the open fold is asked.
      if (openId == null || (!foldDirty() && !saving())) { become(id, check); return true; }
      asked = { holding: openId, wants: id, check };
      tell();
      return false;
    },
    // useUnsavedWork's own, not a page's: a composer with this id is drawn, and `check` says whether it holds words.
    // Call what this returns when it goes. A hold that comes back under the same id replaces the last.
    hold(id, check) {
      const test = typeof check === "function" ? check : () => !!check;
      holds.set(id, test);
      tell();
      return () => { if (holds.get(id) === test) { holds.delete(id); tell(); } };
    },
    discard() { if (asked) become(asked.wants, asked.check); else become(null); },
    stay() { if (!asked) return; asked = null; tell(); },
    close(id) {
      if (id != null && id !== openId) return;
      if (asked) become(asked.wants, asked.check);
      else become(null);
    },
    // For tests: forget what is open, what is asked and what a composer held. The folds counted on the page stay
    // counted, and their bound dirty tests stay bound; they are the page's.
    reset() { holds.clear(); become(null); },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    // useRecordFold's own, not a page's: the fold `id` is on the page, and this is its dirty test, whether the fold is
    // open, waiting behind an ask to open, or closed until something asks for it by its id. A page drawn again as a
    // new instance hands over its own the same way. Nothing else moves, the ask included, and nobody is told: nothing
    // anyone sees has changed. Call what this returns as the fold's page goes: its test is let go of wherever the
    // registry still holds it, a test bound since, by a new instance, is left in place, and an ask for the fold goes
    // unless a new instance has bound by the end of the commit.
    bind(id, check, saves) {
      if (typeof check !== "function") return () => {};
      bound.set(id, check);
      if (typeof saves === "function") busy.set(id, saves);
      if (openId != null && id === openId) openDirty = check;
      if (asked && asked.wants === id) asked.check = check;
      return () => {
        if (bound.get(id) === check) bound.delete(id);
        if (busy.get(id) === saves) busy.delete(id);
        if (openDirty === check) openDirty = null;
        if (asked && asked.check === check) asked.check = undefined;
        // The fold an ask wants is going. Asked a moment later, as drawn() asks, so one that comes straight back as a
        // new instance (binding its own test in the same commit) keeps the ask. Gone for good, the ask goes with it:
        // answered "discard", it would have thrown the holding fold's changes away to open a fold nothing draws. The
        // holding fold stays open with its changes, and is told, so its question goes too.
        queueMicrotask(() => {
          if (asked && asked.wants === id && !bound.has(id)) { asked = null; tell(); }
        });
      };
    },
    // RecordFold's own, not a page's: a fold with this id is on the page; call what this returns when it goes. When
    // the last fold with the open id goes, the registry lets go of it, asked a moment later so a fold that comes
    // straight back, or comes back as a new instance, is counted again first.
    drawn(id) {
      live.set(id, (live.get(id) || 0) + 1);
      return () => {
        const left = (live.get(id) || 1) - 1;
        if (left > 0) live.set(id, left); else live.delete(id);
        queueMicrotask(() => { if (!live.has(id) && openId === id) become(null); });
      };
    },
  };
})();

// One fold's hold on the registry, for the page that draws it, and the one place `open` comes from. A fold the page
// drew open by itself would carry no rail's question and no unload prompt, and nothing would say so. The hook hears
// the registry, so the page redraws as its fold opens, closes or is asked about.
//   const hours = useRecordFold("hours", { dirty: changed, saving: busy });
//   <RecordRow id="hours" act={{ label: "Change", onClick: hours.request }} ... />
//   <RecordFold id="hours" open={hours.open} onCancel={hours.close} saving={busy} ...
//               confirm={hours.asking ? <Confirm ... onYes={hours.discard} onNo={hours.stay} /> : null} />
// The Confirm is the fold's `confirm`, never drawn beside it: inside the fold it sits above Save and Cancel, where the
// changes it asks about are, focus comes back into the fold when it is answered, and it is not drawn while the fold
// saves. Every section may draw that Confirm: `asking` is the registry's { holding, wants } only for the fold holding the
// unsaved changes, where the prompt belongs, and null for every other, the fold asked for included. A section is
// drawn again only when what it sees changes. `dirty` is the fold's unsaved-changes test, a boolean or a function,
// read whenever the registry asks; `saving` is whether its save is out, the same way (the header says what the
// registry does with it). Both are bound to the fold's id as the hook mounts and let go of as it goes, so the
// registry asks it however the fold was opened, by `request` here or by its id from anywhere else on the page; a page
// drawn again as a new instance (a key change, a new parent) hands the registry its own, and a pending ask stands.
const recSameAsk = (a, b) => (a ? a.holding : null) === (b ? b.holding : null) && (a ? a.wants : null) === (b ? b.wants : null);
const useRecordFold = (id, { dirty = false, saving = false } = {}) => {
  const read = () => {
    const ask = recFolds.asking();
    return { open: recFolds.open() === id, asking: ask && ask.holding === id ? ask : null };
  };
  const [seen, setSeen] = useFoldState(read);
  // ONE test for the hook's life, reading the page's latest `dirty`: what it binds and what its request hands over
  // are the same function, because the registry lets go of a test by its identity (bind's unbind). A new one each
  // render was a test the registry never let go of: a request made after a redraw held one the unbind did not know,
  // and a page gone from the screen still answered the Settings rail with its last "holds changes".
  const mine = useFoldRef(null);
  if (!mine.current) {
    const box = { dirty, saving };
    box.holds = () => { const d = box.dirty; return typeof d === "function" ? !!d() : !!d; };
    box.saves = () => { const v = box.saving; return typeof v === "function" ? !!v() : !!v; };
    mine.current = box;
  }
  mine.current.dirty = dirty;
  mine.current.saving = saving;
  const holds = mine.current.holds;
  const saves = mine.current.saves;
  useFoldEffect(() => {
    const unbind = recFolds.bind(id, holds, saves);
    const hear = () => setSeen((was) => { const now = read(); return was.open === now.open && recSameAsk(was.asking, now.asking) ? was : now; });
    hear();
    const unhear = recFolds.subscribe(hear);
    return () => { unhear(); unbind(); };
  }, [id]);
  return {
    open: seen.open,
    asking: seen.asking,
    request: () => recFolds.request(id, { dirty: holds }),
    close: () => recFolds.close(id),
    discard: () => recFolds.discard(),
    stay: () => recFolds.stay(),
  };
};

// The Settings rail's one question before it replaces a pane (settings.jsx SettingsPage): does anything on it hold
// unsaved changes? The open fold answers for itself. The kit sets this once, as it loads, before any pane can mount.
// Anything else that can hold unsaved changes adds its own answer to this one and puts it back when it goes; nothing
// replaces it outright. Since Task 3.7 deleted BusinessEditor, which did exactly that while it was open, the registry
// is the only answer on the Settings pane, which settings-editor.test.mjs holds. A fold whose save is out is asked
// about too, and __settingsSaving says that is why: "Leave without saving?" is untrue of a change on its way to the
// server, so the rail asks in other words.
window.__settingsUnsaved = () => recFolds.dirty() || recFolds.saving();
window.__settingsSaving = () => recFolds.saving();


// ---- What the fold and the inline editor share: focus in and back, their keys, what saving writes, the foot ----

// The first thing in an opened gesture a person would type into or press: the first of its fields' tab stops (data-bits
// tabStops) inside `inner`, never a tip (the mark that explains a label comes before its box) and never its Save or
// Cancel, with the caret at the end of what is there (spec §9); failing that, `fallback`.
const recFocusIn = (el, inner, fallback = null) => {
  if (!el || !el.querySelector) return;
  const within = el.querySelector(inner);
  const stops = within && window.tabStops ? window.tabStops(within) : [];
  const first = stops.find((c) => !c.classList.contains("rec-tip") && !c.closest(".rec-foot")) || (fallback ? el.querySelector(fallback) : null);
  if (!first || !first.focus) return;
  first.focus();
  if (typeof first.value === "string" && first.setSelectionRange) {
    try { first.setSelectionRange(first.value.length, first.value.length); } catch { /* a box that holds no caret */ }
  }
};
// Gone from under the person: taken out of the document (an ask's own button, a removed row), or still in it and
// hidden. The second is not the same thing said twice. An Add that fills a list to its cap is not removed -- the box
// it was in is hidden and the sentence that says why stands where it was -- and the browser blurs a hidden box to the
// document, which is the one place focus must never be left. Reading only document.contains, the hold below saw the
// box still there and left the keyboard at the top of the page (measured in the Playwright journey,
// e2e/settings-business.spec.ts, on the eighth language).
const recGone = (el) => !el || !document.contains || !document.contains(el) || !!(el.closest && el.closest("[hidden]"));
// Focus is on nothing a person put it on: nothing at all, the page itself, or something that has left the document (an
// ask's own button, gone with the ask).
const recFocusLost = () => {
  const now = document.activeElement;
  return !now || now === document.body || !!(document.contains && !document.contains(now));
};
// Closed, or gone: focus that went with it (it is on nothing, or still inside it) comes back to the act of the row it
// opened from. Focus a person has put somewhere else stays there.
const recFocusBack = (id, el) => {
  const now = document.activeElement;
  const lost = recFocusLost() || (el && el.contains && el.contains(now));
  if (!lost || !document.querySelector) return;
  const back = document.querySelector(`[data-rec-act="${id}"]`);
  if (back && back.focus) back.focus();
};
// Focus inside a gesture, once, for every page that draws one, in three parts a gesture takes whole (useRecFocus: a fold,
// an inline editor) or in part (the sheet, record-sheet.jsx, which enters and leaves as a modal dialog does and keeps
// the other two).
//
// As it opens, focus moves to the first thing in it, since the act that opened it has gone; as it closes, focus that
// went with it comes back to that row's act (data-rec-act).
//
// While it is open, focus that WENT WITH SOMETHING comes back into it (useRecFocusHold). The thing focus was on can
// leave the page under it: an ask answered "Keep editing" (its "Yes" held focus), the last shift's remove, an Add that
// turns into the sentence for a full list, an item of a menu that closes, a sheet's Undo left where a row was, or a
// toast's Undo that takes its toast away. Each left a keyboard at the top of the document. After every draw, if the last
// thing in the gesture to take focus is no longer in the document and focus is on nothing, focus goes to where the
// person was: the last of its FIELDS focus was in (never the ask, nor Save and Cancel, nor the head's Close, nor a plain
// press among the fields), its caret where it was left, or the first field when that has gone too.
//
// Only then. Focus a person moved themselves stays where they put it: the box they are typing in when a keystroke
// takes an ask away (moved to the first field, as this first did whenever an ask went, the caret jumped after one
// letter), and the page itself when they clicked away from the gesture, which a redraw must not undo.
//
// And a row a list has just been given takes focus in its first box (useRecFocusOn, `focusOn`: { row }, the row's
// data-rec-row), since the Add that made it is where focus was, and the next thing a person does is type into the row.
//
// `inner` is the selector of the part that holds the gesture's fields (a selector list takes several parts), and
// `fallback` the selector of what takes focus when it holds none.
const useRecFocusHold = (open, box, inner, fallback) => {
  const last = useFoldRef(null);
  // The last thing inside the gesture to take focus, a field or not.
  const had = useFoldRef(null);
  // After every draw: no inputs, so it runs each time.
  useFoldEffect(() => {
    const went = had.current;
    if (!open || !went || !recGone(went)) return;
    had.current = null;
    // Focus is still ON the thing that has just gone from under it: a box hidden rather than removed keeps it until
    // the browser's next rendering update, which is after this effect, and then hands it to the document. Moved here,
    // there is nothing left for the browser to blur. Focus a person moved themselves is elsewhere by now, and stays.
    if (!recFocusLost() && document.activeElement !== went) return;
    const el = box.current;
    const back = last.current;
    const there = back && back.focus && el && el.contains && el.contains(back) && !recGone(back);
    if (there) back.focus(); else recFocusIn(el, inner, fallback);
  });
  return {
    // Closed, where the person was is forgotten with the draft.
    forget: () => { last.current = null; had.current = null; },
    onFocus: (e) => {
      const t = e && e.target;
      if (!t || !t.closest) return;
      had.current = t;
      if (!t.closest(inner) || t.closest(".confirm") || t.closest(".rec-foot")) return;
      // A field is where a person was; a plain press (a row's remove, Add, a menu's item) is what they did there, and is
      // often the very thing that has gone. A switch or a radio is a button that is a field.
      if (t.matches && t.matches("button:not([role])")) return;
      last.current = t;
    },
  };
};
const useRecFocusOn = (open, box, focusOn) => useFoldEffect(() => {
  const el = box.current;
  if (!open || !focusOn || !focusOn.row || !el || !el.querySelector) return;
  const row = el.querySelector(`[data-rec-row="${focusOn.row}"]`);
  const first = row && window.tabStops ? window.tabStops(row)[0] : null;
  if (first && first.focus) first.focus();
}, [focusOn]);
// `frame` names what drew the gesture (a fold on a phone is a sheet): a new frame is a new element, and focus that was
// in the old one went with it, so it goes to the first thing in the new one, as it does on opening.
const useRecFocus = (id, open, box, inner, fallback, focusOn = null, frame = null) => {
  const hold = useRecFocusHold(open, box, inner, fallback);
  useFoldEffect(() => {
    if (!open) { hold.forget(); return undefined; }
    const el = box.current;
    recFocusIn(el, inner, fallback);
    return () => recFocusBack(id, el);
  }, [open, id, frame]);
  useRecFocusOn(open, box, focusOn);
  return hold.onFocus;
};
// A gesture whose page goes away (the rail's "Yes, leave" replaces the pane) lets go of the registry: left as the open
// fold, its dirty check would go on answering after it had gone, and the rail would ask on every tab and the browser
// before every reload. The registry counts what is on the page by id (drawn), so one that comes straight back
// (StrictMode, in development) or comes back as a new instance (a key change, a new parent) keeps hold. One closed, or
// given way to another, before it goes is no longer the open one, and leaves it alone.
const useRecDrawn = (id) => useFoldEffect(() => recFolds.drawn(id), [id]);
// Whether the window is a phone's: the kit's one breakpoint, record.css's `max-width: 760px`, read as Reports reads it
// (reports-sections.jsx useRptPhone) and kept current as the window changes size.
const REC_PHONE_QUERY = "(max-width: 760px)";
const recPhoneQuery = () => (typeof window.matchMedia === "function" ? window.matchMedia(REC_PHONE_QUERY) : null);
const useRecPhone = () => {
  const [phone, setPhone] = useFoldState(() => { const q = recPhoneQuery(); return !!(q && q.matches); });
  useFoldEffect(() => {
    const q = recPhoneQuery();
    if (!q || !q.addEventListener) return undefined;
    const on = (e) => setPhone(!!e.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return phone;
};
// A modal sheet's Escape from anywhere, while `on`: from inside it, the sheet's own keys take it first and say so
// (defaultPrevented); with focus on the page's body, where nobody put it, the key is still the sheet's. `cancel` is read
// as the key arrives, and null (a save that is out) cancels nothing. The listener is on only while the sheet is; the
// hook is called whether or not it is.
const useRecSheetEscape = (on, cancel) => {
  const latest = useFoldRef(cancel);
  latest.current = cancel;
  useFoldEffect(() => {
    if (!on) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || !latest.current) return;
      e.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on]);
};
// Escape cancels, unless something inside took the key first (a combobox's list closing); Ctrl or Cmd with Enter saves.
// Neither while it saves: the save is on its way and closes it when the server takes it, and a Cancel meanwhile would
// say the change was thrown away. Only its own keys: a portal's bubble through React from outside its DOM (a sheet
// drawn from a field inside it), and its Ctrl+Enter would save it.
const recKeys = ({ onCancel, onSave, saving, refused }) => (e) => {
  if (e.defaultPrevented || !e.currentTarget || !e.currentTarget.contains(e.target)) return;
  if (e.key === "Escape" && onCancel && !saving) { e.preventDefault(); onCancel(); return; }
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSave && !saving && !refused) { e.preventDefault(); onSave(); }
};

// What saving writes, in the composer's own words: the lines it adds, under the page's eyebrow (`label`); the lines it
// takes away, under a second (`goneLabel`); and a sentence of the page's own before them (`note`), where the change
// reaches past its lines. Nothing to say draws nothing, never an empty block. `inline` sets each eyebrow beside its
// lines, as an inline editor's row does on a desktop; a fold, and every phone, stacks them.
//
// Each line is a span of its own inside the block's <pre>, in the same text, newlines and all. `changed` and
// `goneChanged` are the indexes of the lines of `text` and of `gone` that the draft has just changed: the page works
// that out, since it holds the block before and after (business-tab-gestures.jsx), and the kit marks those lines
// `data-changed` for record.css's wash (spec §9, item 3: only the changed clause, once). A line is keyed by its words,
// so a line rewritten is a new element and washes as it arrives, and a line that stays keeps its element and never
// washes again, whatever else is marked.
const recSaysLines = (text, marks) => {
  const on = new Set(Array.isArray(marks) ? marks : []);
  const seen = new Map();
  return text.split("\n").map((line, i) => {
    const n = (seen.get(line) || 0) + 1;
    seen.set(line, n);
    return (
      <React.Fragment key={`${n}:${line}`}>
        {i ? "\n" : null}
        <span className="rec-says-line" data-changed={on.has(i) ? "true" : undefined}>{line}</span>
      </React.Fragment>
    );
  });
};
const RecordSays = ({ id = null, testid = null, text = null, label = null, gone = null, goneLabel = null, note = null, inline = false, changed = null, goneChanged = null }) => {
  const writes = typeof text === "string" && text.trim() !== "";
  const drops = typeof gone === "string" && gone.trim() !== "";
  if (!writes && !drops && !note) return null;
  return (
    <div className="rec-says" id={id || undefined} data-inline={inline ? "true" : undefined} data-testid={testid || undefined}>
      {note ? <p className="rec-says-note" data-testid={testid ? `${testid}-note` : undefined}>{note}</p> : null}
      {writes ? (
        <div className="rec-says-part" data-part="says">
          {label ? <span className="rec-says-eyebrow">{label}</span> : null}
          <pre>{recSaysLines(text, changed)}</pre>
        </div>
      ) : null}
      {drops ? (
        <div className="rec-says-part" data-part="gone">
          {goneLabel ? <span className="rec-says-eyebrow">{goneLabel}</span> : null}
          <pre>{recSaysLines(gone, goneChanged)}</pre>
        </div>
      ) : null}
    </div>
  );
};

// The foot: Save and Cancel, and beside them a line of the page's (`footNote`) or the keys that do the same (`keys`,
// which record.css hides on a touch screen, where there are none). Save is busy, not disabled, while it saves: a disabled
// button lets go of focus, to the page, and a save that failed left it there. It stays a button focus can rest on, and
// a press while it saves does nothing; so does a press on Cancel, for the reason recKeys gives.
const RecordFoot = ({
  saveTestid, cancelTestid, onSave, onCancel, saving = false, saveLabel = "Save", savingLabel = "Saving…",
  cancelLabel = "Cancel", gate = null, footNote = null, keys = null,
}) => (
  <div className="rec-foot">
    <button
      type="button"
      className="btn btn-sm btn-primary"
      onClick={(e) => { if (saving) { e.preventDefault(); return; } if (onSave) onSave(e); }}
      aria-disabled={saving || undefined}
      aria-busy={saving || undefined}
      data-testid={saveTestid}
      {...(gate || {})}
    >
      {saving ? savingLabel : saveLabel}
    </button>
    <button
      type="button"
      className="btn btn-sm btn-ghost"
      onClick={(e) => { if (saving) { e.preventDefault(); return; } if (onCancel) onCancel(e); }}
      aria-disabled={saving || undefined}
      data-testid={cancelTestid}
    >
      {cancelLabel}
    </button>
    {footNote ? <span className="rec-foot-note">{footNote}</span> : null}
    {keys ? <span className="rec-foot-keys">{keys}</span> : null}
  </div>
);

// ---- A fold's sheet leaving the page ----

// Spec §9, item 1 closes a fold on --ease-in-out, and on a phone a fold is a sheet (below), which React takes off the
// page the moment the registry closes it: focus goes back to the row's act and the next fold is let in at once, and
// neither may wait on a motion. So nothing of React's is kept. What leaves is a still copy of the sheet and its wash as
// they were on screen -- a cloned box and textarea keep their typed values (the HTML clone steps), and the body is put
// back where it had scrolled to -- in the app's root beside where they stood, with nothing in it to press, focus, name
// or find: no role, no ids and no test ids anywhere in it, `inert`, hidden from a screen reader. record.css slides it
// down and fades its wash (data-leaving) on --duration-base and --ease-in-out, and it is gone as its slide ends, or
// after twice that if no slide runs. Under reduced motion there is no copy at all: the sheet goes at once.
const REC_LEAVE_FALLBACK_MS = 400;
const recReducedMotion = () =>
  typeof window.matchMedia === "function" && !!window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const recStill = (node, deep) => {
  const copy = node.cloneNode(deep);
  const all = [copy].concat(copy.querySelectorAll ? Array.from(copy.querySelectorAll("*")) : []);
  for (const n of all) {
    n.removeAttribute("id");
    n.removeAttribute("data-testid");
  }
  for (const k of ["role", "aria-modal", "aria-labelledby", "aria-describedby", "aria-busy"]) copy.removeAttribute(k);
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  copy.setAttribute("data-leaving", "true");
  return copy;
};
const recSheetLeaves = (sheet, wash, top) => {
  const root = document.querySelector ? document.querySelector(".app-root") : null;
  if (!root || !sheet || !sheet.cloneNode || recReducedMotion()) return;
  const washCopy = wash && wash.cloneNode ? recStill(wash, false) : null;
  const sheetCopy = recStill(sheet, true);
  if (washCopy) root.appendChild(washCopy);
  root.appendChild(sheetCopy);
  const body = sheetCopy.querySelector ? sheetCopy.querySelector(".rec-sheet-body") : null;
  if (body) body.scrollTop = top;
  let gone = false;
  const go = () => {
    if (gone) return;
    gone = true;
    sheetCopy.remove();
    if (washCopy) washCopy.remove();
  };
  sheetCopy.addEventListener("transitionend", (e) => { if (e.target === sheetCopy) go(); });
  setTimeout(go, REC_LEAVE_FALLBACK_MS);
};
// A fold's sheet, its wash, and where its body had scrolled to, read as the draw that closes it is made, while React's
// refs still hold the sheet (by the time it is taken away they are let go of); and, as it goes, its leaving -- only when
// the fold has CLOSED. A width crossed with the fold open draws it in the other frame, and a page going away takes it
// with it: neither is a sheet leaving.
const useRecLeaving = (sheet, open, box) => {
  const wash = useFoldRef(null);
  const shown = useFoldRef({ was: false, sheet: null, wash: null, top: 0 });
  const openNow = useFoldRef(open);
  openNow.current = open;
  if (shown.current.was) {
    shown.current.sheet = box.current || shown.current.sheet;
    shown.current.wash = wash.current || shown.current.wash;
  }
  shown.current.was = sheet;
  useFoldLayout(() => {
    if (!sheet) return undefined;
    return () => {
      const was = shown.current;
      shown.current = { was: was.was, sheet: null, wash: null, top: 0 };
      if (!openNow.current) recSheetLeaves(was.sheet, was.wash, was.top);
    };
  }, [sheet]);
  return { wash, scrolled: (e) => { if (e && e.currentTarget) shown.current.top = e.currentTarget.scrollTop; } };
};

// ---- The fold: a set of fields, under the row that states them ----

// `confirm` is the page's ask (its Confirm), drawn above the foot while it is open: the section's own "Discard your
// changes?", or the registry's `asking`. Answered with "Keep editing", focus comes back into the fold (useRecFocus).
// `focusOn` ({ row }) names a row a list in it has just been given, by the data-rec-row the page put on it: focus goes
// to that row's first box. A new object each time, so the same row named twice is focused twice.
// `changed` and `goneChanged` are the lines of `says` and `gone` the draft has just changed, for RecordSays to mark.
// Not while it saves: nothing asks whether to discard a change that is on its way (the header says what happens to an
// ask meanwhile), and the fold says it is busy.
const RecordFold = ({
  id, label, hint = null, open = true, says = null, saysLabel = null, gone = null, goneLabel = null, note = null,
  footNote = null, confirm = null, focusOn = null, changed = null, goneChanged = null,
  onSave, onCancel, saving = false, saveLabel = "Save", savingLabel = "Saving…", cancelLabel = "Cancel", closeLabel = "Close",
  gate = null, wide = false, behind = null, children = null,
}) => {
  const box = useFoldRef(null);
  const ask = saving ? null : confirm;
  // Every hook here is called on every draw, whichever frame is drawn: the frame is a value, never a hook of its own,
  // because the tests' stub React keeps every hook on a page in one call order (_legacy-react.mjs).
  const phone = useRecPhone();
  const sheet = open && phone;
  const onFocus = useRecFocus(id, open, box, ".rec-fold-inner", sheet ? ".rec-sheet-close" : ".rec-fold-close", focusOn, sheet);
  useRecDrawn(id);
  useRecSheetEscape(sheet, saving ? null : onCancel);
  const leaving = useRecLeaving(sheet, open, box);
  const labelId = `rec-fold-${id}-label`;
  const closeId = `rec-fold-${id}-close`;
  const refused = !!(gate && gate["aria-disabled"]);
  const keys = recKeys({ onCancel, onSave, saving, refused });
  // Close, the foot's Cancel and a press on a phone's wash are one Cancel, and none acts while the fold saves (recKeys
  // says why): Close once cancelled then, where the foot's Cancel and Escape did not.
  const cancel = (e) => { if (saving) { if (e && e.preventDefault) e.preventDefault(); return; } if (onCancel) onCancel(e); };
  const told = <RecordSays id={`rec-fold-${id}-says`} testid={`rec-fold-says-${id}`} text={says} label={saysLabel} gone={gone} goneLabel={goneLabel} note={note} changed={changed} goneChanged={goneChanged} />;
  const foot = (
    <RecordFoot
      saveTestid={`rec-fold-save-${id}`}
      cancelTestid={`rec-fold-cancel-${id}`}
      onSave={onSave}
      onCancel={onCancel}
      saving={saving}
      saveLabel={saveLabel}
      savingLabel={savingLabel}
      cancelLabel={cancelLabel}
      gate={gate}
      footNote={footNote}
    />
  );
  if (sheet) {
    const hintId = hint ? `rec-fold-${id}-hint` : undefined;
    // The sheet's frame, as RecordSheet draws it on a phone: a wash over the page, and the sheet from the bottom with
    // its head, a body that scrolls and a foot that holds still. Drawn in the app's root for RecordSheet's reasons (a
    // Settings pane animates itself in with a transform and sizes every child to its column; People's keys hold still
    // under a dialog there, PL_OVERLAY). The fields and what saving writes scroll; the ask, Save and Cancel stay in the
    // foot, clear of the home indicator.
    const node = (
      <>
        {/* A mousedown keeps focus where it was, as the sheet's wash does. The press is the fold's Cancel: a person
            reaching past the sheet for another row is asked about what they typed, and one who typed nothing is back
            on the page. */}
        <div className="rec-sheet-backdrop" data-fold="true" aria-hidden="true" ref={leaving.wash} onMouseDown={(e) => e.preventDefault()} onClick={cancel} />
        <section
          ref={box}
          className="rec-sheet rec-fold-sheet"
          role="dialog"
          aria-modal={true}
          aria-labelledby={labelId}
          aria-describedby={hintId}
          aria-busy={saving || undefined}
          data-open="true"
          data-testid={`rec-fold-${id}`}
          onFocus={onFocus}
          onKeyDown={(e) => { if (e.key === "Tab") { window.trapTab(e, e.currentTarget); return; } keys(e); }}
        >
          <header className="rec-sheet-head">
            <div className="rec-sheet-heading">
              <h2 className="rec-sheet-title" id={labelId}>{label}</h2>
              {hint ? <p className="rec-sheet-sub" id={hintId}>{hint}</p> : null}
            </div>
            <button
              type="button"
              className="rec-sheet-close"
              id={closeId}
              aria-label={closeLabel}
              aria-labelledby={`${closeId} ${labelId}`}
              aria-disabled={saving || undefined}
              onClick={cancel}
              data-testid={`rec-fold-close-${id}`}
            >
              <Icon name="x" size={13} />
            </button>
          </header>
          <div className="rec-sheet-body" onScroll={leaving.scrolled}>
            <div className="rec-fold-inner">
              {children}
              {told}
            </div>
          </div>
          <footer className="rec-sheet-foot">
            {ask}
            {foot}
          </footer>
        </section>
      </>
    );
    const root = document.querySelector ? document.querySelector(".app-root") : null;
    const drawn = root && window.ReactDOM && window.ReactDOM.createPortal ? window.ReactDOM.createPortal(node, root) : node;
    // What the page draws at rest in the fold's place, its row, stays in the card behind the sheet (`behind`): a card a
    // row shorter under the wash grew back as the sheet left, which its leaving would have put on show.
    return behind ? <>{behind}{drawn}</> : drawn;
  }
  return (
    <div
      ref={box}
      className="rec-fold"
      role="group"
      aria-labelledby={labelId}
      aria-busy={saving || undefined}
      data-open={open ? "true" : "false"}
      hidden={open ? undefined : true}
      data-wide={wide ? "true" : undefined}
      data-testid={`rec-fold-${id}`}
      onFocus={onFocus}
      onKeyDown={keys}
    >
      <div className="rec-fold-head">
        <span className="rec-fold-label" id={labelId}>{label}</span>
        <span className="rec-fold-hint">{hint}</span>
        {/* Close is Cancel (above). Not disabled while the fold saves, as Save is not. */}
        <button
          type="button"
          className="rec-fold-close"
          id={closeId}
          aria-labelledby={`${closeId} ${labelId}`}
          aria-disabled={saving || undefined}
          onClick={cancel}
          data-testid={`rec-fold-close-${id}`}
        >
          {closeLabel}
        </button>
      </div>
      <div className="rec-fold-body">
        <div className="rec-fold-inner">
          {children}
          {told}
          {ask}
          {foot}
        </div>
      </div>
    </div>
  );
};

// ---- The inline editor: one value, edited in the row that states it ----

// The kit's third gesture (spec §5, canvas Edit-Inline), for one value. The row becomes its field: its label stays in
// the label column (`label`, drawn as rec-inline-<id>-key, which names the whole editor and which the page's field
// names its box by), and the page's field, what saving writes (RecordSays, as rec-inline-<id>-says, which describes the
// box), the page's ask, and Save and Cancel with the keys that do the same take the value's place. A disagreement on
// the row (`disputed`, RecordRow's shape) stays on screen while it is edited, to read: its press is the row's, at rest.
// Its line carries no id here: the editor is on the page, hidden, while the row is at rest, and the row's own line has
// the id its press is described by (rec-row-<id>-other), which was in the document twice.
//
//   const website = useRecordFold("website", { dirty: changed });
//   {website.open ? null : <RecordRow id="website" act={{ label: "Change", onClick: website.request }} ... />}
//   <RecordInline id="website" label="Website" open={website.open} says={lines} saysLabel="It will say"
//                 confirm={asking ? <Confirm ... /> : null} onSave={save} onCancel={cancel} saving={busy} gate={…}>
//     <RecordField id="website-box" label={null} aria-labelledby="rec-inline-website-key" … />
//   </RecordInline>
//
// Like a fold it is drawn on every render and flips `open`: closed, it is `hidden`, whole. It holds nothing of its
// own: whether it is open comes from the registry (useRecordFold), and the draft, the check and the save are the
// page's. It shares the fold's focus, keys and foot, and registers with the registry as a fold does (drawn).
const RecordInline = ({
  id, label, open = true, says = null, saysLabel = null, gone = null, goneLabel = null, note = null, disputed = null,
  confirm = null, onSave, onCancel, saving = false, saveLabel = "Save", savingLabel = "Saving…", cancelLabel = "Cancel",
  keys = "Esc cancels · ⌘↵ saves", gate = null, changed = null, goneChanged = null, children = null,
}) => {
  const box = useFoldRef(null);
  // Its ask is not drawn while it saves, as a fold's is not.
  const ask = saving ? null : confirm;
  const onFocus = useRecFocus(id, open, box, ".rec-inline-body", null);
  useRecDrawn(id);
  const keyId = `rec-inline-${id}-key`;
  const refused = !!(gate && gate["aria-disabled"]);
  const Dispute = window.RecordDispute;
  return (
    <div
      ref={box}
      className="rec-inline"
      role="group"
      aria-labelledby={keyId}
      aria-busy={saving || undefined}
      data-open={open ? "true" : "false"}
      hidden={open ? undefined : true}
      data-testid={`rec-inline-${id}`}
      onFocus={onFocus}
      onKeyDown={recKeys({ onCancel, onSave, saving, refused })}
    >
      <span className="rec-inline-key" id={keyId}>{label}</span>
      <div className="rec-inline-body">
        {disputed && Dispute ? <Dispute disputed={{ value: disputed.value, source: disputed.source, sentence: disputed.sentence }} /> : null}
        {children}
        <RecordSays id={`rec-inline-${id}-says`} testid={`rec-inline-says-${id}`} text={says} label={saysLabel} gone={gone} goneLabel={goneLabel} note={note} changed={changed} goneChanged={goneChanged} inline />
        {ask}
        <RecordFoot
          saveTestid={`rec-inline-save-${id}`}
          cancelTestid={`rec-inline-cancel-${id}`}
          onSave={onSave}
          onCancel={onCancel}
          saving={saving}
          saveLabel={saveLabel}
          savingLabel={savingLabel}
          cancelLabel={cancelLabel}
          gate={gate}
          keys={keys}
        />
      </div>
    </div>
  );
};

// RecordFoot is on window too, for the one gesture that is not in this file and keeps the same foot: a sheet's Save and
// Cancel (record-sheet.jsx takes its foot from the page, and the Business tab's sheet draws this one in it).
// useRecFocusHold and useRecFocusOn are the sheet's (record-sheet.jsx), which keeps a fold's focus rules but enters and
// leaves as a modal dialog.
// recKeys too: the sheet saves with Ctrl or Cmd and Enter by the same rule.

// ---- Work half-done that is not a fold: a composer's words ----------------------------------------------------
// The one rule for a composer (legacy CLAUDE.md, the loading standard's G): its words are kept in the tab as they are
// typed (window.__tabMemory, by `kind`, and `key` where there is one composer per thing -- a playbook being changed),
// come back when the composer opens again, and go when the server takes them (`done`) or the person throws them
// away. While it holds words, the tab asks before closing over them and Settings' rail before replacing them (the
// registry's hold), and its Cancel asks once (`leave` -> `asking`; UnsavedAsk draws the question; `discard` and
// `stay` answer it). With nothing typed, Cancel closes at once. The page says what counts as words (`dirty`) and
// what to keep (`value`); what was kept is read as the page's state is made, with tabDraft(kind, key).
//   const kept = window.tabDraft("broadcast");
//   const work = useUnsavedWork("broadcast", null, { value: { aud, name, ... }, dirty: !!name.trim(), onLeave: close });
//   <button onClick={work.leave}>Cancel</button>
//   {work.asking ? <UnsavedAsk onYes={work.discard} onNo={work.stay} testid="bc-leave" /> : null}
// Nothing is kept where the tab has no memory (the standalone harness): the guard still asks, the draft is the page's.
const tabDraft = (kind, key) => (window.__tabMemory ? window.__tabMemory.draft(kind, key == null ? undefined : key) : null);
const useUnsavedWork = (kind, key, { value, dirty, onLeave }) => {
  const [asking, setAsking] = useFoldState(false);
  const dirtyNow = useFoldRef(dirty);
  dirtyNow.current = dirty;
  const k = key == null ? undefined : key;
  const drop = () => { if (window.__tabMemory) window.__tabMemory.dropDraft(kind, k); };
  // Kept as it changes, never on a timer: a tab closed a keystroke later has the keystroke. Nothing typed, nothing kept.
  const json = JSON.stringify(value);
  useFoldEffect(() => {
    if (!window.__tabMemory) return;
    if (dirty) window.__tabMemory.keepDraft(kind, value, k); else drop();
  }, [kind, k, json, dirty]);
  useFoldEffect(() => recFolds.hold(`${kind}:${k || ""}`, () => dirtyNow.current), [kind, k]);
  return {
    dirty,
    asking,
    leave: () => { if (dirtyNow.current) setAsking(true); else { drop(); onLeave(); } },
    discard: () => { setAsking(false); drop(); onLeave(); },
    stay: () => setAsking(false),
    // The server took it: there is nothing left to keep.
    done: drop,
  };
};
// The one question, where the Cancel was. `what` is what has not happened: sent, saved, submitted.
const UnsavedAsk = ({ onYes, onNo, busy = false, what = "sent", testid = null }) => (
  <window.Confirm question="Throw away what you've written?" detail={`Nothing has been ${what}.`} yes="Yes, throw it away" no="Keep writing" danger busy={busy} onYes={onYes} onNo={onNo} testid={testid} />
);

Object.assign(window, {
  RecordFold, RecordInline, RecordSays, RecordFoot, useRecordFold, useRecFocusHold, useRecFocusOn, recKeys,
  useUnsavedWork, UnsavedAsk, tabDraft, __recordFolds: recFolds,
});
