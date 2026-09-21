/* global React */
// Chanlytics record kit: the fold and the inline editor, and the rule that only one is open.
//
// Two of the kit's three gestures (spec §5): the fold, a set of fields opened under the row that states them, and the
// inline editor, one value edited in its row (RecordInline, below RecordFold); the sheet is record-sheet.jsx. The two
// here share what they have in common rather than holding two copies of it: focus in as they open, back as they close,
// and back in when an ask inside them is answered (useRecFocus); Escape and Ctrl or Cmd with Enter (recKeys); what
// saving writes (RecordSays); Save and Cancel (RecordFoot); and their hold on the registry (useRecDrawn).
//
// A set of fields opens under the row that states them. Its head keeps the row's label where it was and puts the
// page's hint where the value was; its act becomes Close. Under its fields, a fold can show what saving it will
// write (`says`, under the page's own eyebrow, `saysLabel`), and its foot carries its own Save and Cancel. The page
// decides what its fields are and what saving does; the kit knows none of it. Whether it is open comes from the
// registry, through useRecordFold (below): the `open` prop stays, but a fold drawn open without the registry holds
// no guard.
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
// holding fold itself (saved or cancelled; the one asked for then opens). close(id) from a fold that is not the open
// one does nothing. subscribe(fn) hears every change. A page reaches all of this through useRecordFold rather than by
// hand.
// Three are not for pages: drawn(id) is RecordFold's own (it counts the folds with each id on the page, and when the
// last one with the open id goes, the registry lets go); bind(id, check) is useRecordFold's (a fold's dirty test, by
// its id, for as long as the fold is on the page; a page drawn again hands over its own); and reset() is for tests (it
// forgets what is open and asked).

const { useRef: useFoldRef, useEffect: useFoldEffect, useState: useFoldState } = React;

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
  // "Nothing open" is null, never merely falsy: a fold may be called 0 or "". A check that throws is taken as holding
  // changes: asking once too often loses nothing.
  const dirty = () => {
    if (openId == null) return false;
    const check = typeof openDirty === "function" ? openDirty : bound.get(openId);
    if (typeof check !== "function") return false;
    try { return !!check(); } catch { return true; }
  };
  // The browser asks before the tab closes over a dirty fold. The listener is on only while a fold is open, as
  // BusinessEditor's was only while it held changes, and it asks the fold at the moment the tab closes.
  const hold = (e) => { if (!dirty()) return; e.preventDefault(); e.returnValue = ""; };
  // Each listener hears every change, whatever another does: one that throws is reported and the rest still hear.
  const tell = () => {
    window.removeEventListener("beforeunload", hold);
    if (openId != null) window.addEventListener("beforeunload", hold);
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
    asking: () => (asked ? { holding: asked.holding, wants: asked.wants } : null),
    request(id, { dirty: given } = {}) {
      const check = typeof given === "function" ? given : bound.get(id);
      if (id === openId) {
        if (typeof check === "function") openDirty = check;
        asked = null;
        tell();
        return true;
      }
      if (openId == null || !dirty()) { become(id, check); return true; }
      asked = { holding: openId, wants: id, check };
      tell();
      return false;
    },
    discard() { if (asked) become(asked.wants, asked.check); else become(null); },
    stay() { if (!asked) return; asked = null; tell(); },
    close(id) {
      if (id != null && id !== openId) return;
      if (asked) become(asked.wants, asked.check);
      else become(null);
    },
    // For tests: forget what is open and what is asked. The folds counted on the page stay counted, and their bound
    // dirty tests stay bound; they are the page's.
    reset() { become(null); },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    // useRecordFold's own, not a page's: the fold `id` is on the page, and this is its dirty test, whether the fold is
    // open, waiting behind an ask to open, or closed until something asks for it by its id. A page drawn again as a
    // new instance hands over its own the same way. Nothing else moves, the ask included, and nobody is told: nothing
    // anyone sees has changed. Call what this returns as the fold's page goes: its test is let go of wherever the
    // registry still holds it, and a test bound since, by a new instance, is left in place.
    bind(id, check) {
      if (typeof check !== "function") return () => {};
      bound.set(id, check);
      if (openId != null && id === openId) openDirty = check;
      if (asked && asked.wants === id) asked.check = check;
      return () => {
        if (bound.get(id) === check) bound.delete(id);
        if (openDirty === check) openDirty = null;
        if (asked && asked.check === check) asked.check = undefined;
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
//   const hours = useRecordFold("hours", { dirty: changed });
//   <RecordRow id="hours" act={{ label: "Change", onClick: hours.request }} ... />
//   <RecordFold id="hours" open={hours.open} onCancel={hours.close} ... />
//   {hours.asking ? <Confirm ... onYes={hours.discard} onNo={hours.stay} /> : null}
// Every section may draw that Confirm: `asking` is the registry's { holding, wants } only for the fold holding the
// unsaved changes, where the prompt belongs, and null for every other, the fold asked for included. A section is
// drawn again only when what it sees changes. `dirty` is the fold's unsaved-changes test, a boolean or a function,
// read whenever the registry asks. It is bound to the fold's id as the hook mounts and let go of as it goes, so the
// registry asks it however the fold was opened, by `request` here or by its id from anywhere else on the page; a page
// drawn again as a new instance (a key change, a new parent) hands the registry its own, and a pending ask stands.
const recSameAsk = (a, b) => (a ? a.holding : null) === (b ? b.holding : null) && (a ? a.wants : null) === (b ? b.wants : null);
const useRecordFold = (id, { dirty = false } = {}) => {
  const read = () => {
    const ask = recFolds.asking();
    return { open: recFolds.open() === id, asking: ask && ask.holding === id ? ask : null };
  };
  const [seen, setSeen] = useFoldState(read);
  const dirtyNow = useFoldRef(dirty);
  dirtyNow.current = dirty;
  const holds = () => { const d = dirtyNow.current; return typeof d === "function" ? !!d() : !!d; };
  useFoldEffect(() => {
    const unbind = recFolds.bind(id, holds);
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
// Anything else that can hold unsaved changes adds its own answer to this one and puts it back when it goes, as
// BusinessEditor does until the record replaces it; nothing replaces it outright.
window.__settingsUnsaved = () => recFolds.dirty();


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
// Closed, or gone: focus that went with it (it is on nothing, or still inside it) comes back to the act of the row it
// opened from. Focus a person has put somewhere else stays there.
const recFocusBack = (id, el) => {
  const now = document.activeElement;
  const lost = !now || now === document.body || (el && el.contains && el.contains(now)) || (document.contains && !document.contains(now));
  if (!lost || !document.querySelector) return;
  const back = document.querySelector(`[data-rec-act="${id}"]`);
  if (back && back.focus) back.focus();
};
// As it opens, focus moves to the first thing in it, since the act that opened it has gone; as it closes, focus that
// went with it comes back to that row's act (data-rec-act). And when an ask drawn inside it is answered while it is
// still open, focus comes back into it: the ask's "Yes" held focus, and "Keep editing" or Esc took the ask away with
// focus on it, which left a keyboard at the top of the document.
const useRecFocus = (id, open, asked, box, inner, fallback) => {
  useFoldEffect(() => {
    if (!open) return undefined;
    const el = box.current;
    recFocusIn(el, inner, fallback);
    return () => recFocusBack(id, el);
  }, [open, id]);
  const wasAsked = useFoldRef(asked);
  useFoldEffect(() => {
    const was = wasAsked.current;
    wasAsked.current = asked;
    if (open && was && !asked) recFocusIn(box.current, inner, fallback);
  }, [open, asked]);
};
// A gesture whose page goes away (the rail's "Yes, leave" replaces the pane) lets go of the registry: left as the open
// fold, its dirty check would go on answering after it had gone, and the rail would ask on every tab and the browser
// before every reload. The registry counts what is on the page by id (drawn), so one that comes straight back
// (StrictMode, in development) or comes back as a new instance (a key change, a new parent) keeps hold. One closed, or
// given way to another, before it goes is no longer the open one, and leaves it alone.
const useRecDrawn = (id) => useFoldEffect(() => recFolds.drawn(id), [id]);
// Escape cancels, unless something inside took the key first (a combobox's list closing); Ctrl or Cmd with Enter saves.
// Neither while it saves: the save is on its way and closes it when the server takes it, and a Cancel meanwhile would
// say the change was thrown away. Only its own keys: a portal's bubble through React from outside its DOM (a sheet
// drawn from a field inside it), and its Ctrl+Enter would save it.
const recKeys = ({ onCancel, onSave, saving, refused }) => (e) => {
  if (e.defaultPrevented || !e.currentTarget.contains(e.target)) return;
  if (e.key === "Escape" && onCancel && !saving) { e.preventDefault(); onCancel(); return; }
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSave && !saving && !refused) { e.preventDefault(); onSave(); }
};

// What saving writes, in the composer's own words: the lines it adds, under the page's eyebrow (`label`); the lines it
// takes away, under a second (`goneLabel`); and a sentence of the page's own before them (`note`), where the change
// reaches past its lines. Nothing to say draws nothing, never an empty block. `inline` sets each eyebrow beside its
// lines, as an inline editor's row does on a desktop; a fold, and every phone, stacks them.
const RecordSays = ({ id = null, testid = null, text = null, label = null, gone = null, goneLabel = null, note = null, inline = false }) => {
  const writes = typeof text === "string" && text.trim() !== "";
  const drops = typeof gone === "string" && gone.trim() !== "";
  if (!writes && !drops && !note) return null;
  return (
    <div className="rec-says" id={id || undefined} data-inline={inline ? "true" : undefined} data-testid={testid || undefined}>
      {note ? <p className="rec-says-note" data-testid={testid ? `${testid}-note` : undefined}>{note}</p> : null}
      {writes ? (
        <div className="rec-says-part" data-part="says">
          {label ? <span className="rec-says-eyebrow">{label}</span> : null}
          <pre>{text}</pre>
        </div>
      ) : null}
      {drops ? (
        <div className="rec-says-part" data-part="gone">
          {goneLabel ? <span className="rec-says-eyebrow">{goneLabel}</span> : null}
          <pre>{gone}</pre>
        </div>
      ) : null}
    </div>
  );
};

// The foot: Save and Cancel, and beside them a line of the page's (`note`) or the keys that do the same (`keys`, which
// record.css hides on a touch screen, where there are none). Save is busy, not disabled, while it saves: a disabled
// button lets go of focus, to the page, and a save that failed left it there. It stays a button focus can rest on, and
// a press while it saves does nothing; so does a press on Cancel, for the reason recKeys gives.
const RecordFoot = ({
  saveTestid, cancelTestid, onSave, onCancel, saving = false, saveLabel = "Save", savingLabel = "Saving…",
  cancelLabel = "Cancel", gate = null, note = null, keys = null,
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
    {note ? <span className="rec-foot-note">{note}</span> : null}
    {keys ? <span className="rec-foot-keys">{keys}</span> : null}
  </div>
);

// ---- The fold: a set of fields, under the row that states them ----

// `confirm` is the page's ask (its Confirm), drawn above the foot while it is open: the section's own "Discard your
// changes?", or the registry's `asking`. Answered with "Keep editing", focus comes back into the fold (useRecFocus).
const RecordFold = ({
  id, label, hint = null, open = true, says = null, saysLabel = null, note = null, confirm = null,
  onSave, onCancel, saving = false, saveLabel = "Save", savingLabel = "Saving…", cancelLabel = "Cancel", closeLabel = "Close",
  gate = null, wide = false, children = null,
}) => {
  const box = useFoldRef(null);
  useRecFocus(id, open, !!confirm, box, ".rec-fold-inner", ".rec-fold-close");
  useRecDrawn(id);
  const labelId = `rec-fold-${id}-label`;
  const closeId = `rec-fold-${id}-close`;
  const refused = !!(gate && gate["aria-disabled"]);
  return (
    <div
      ref={box}
      className="rec-fold"
      role="group"
      aria-labelledby={labelId}
      data-open={open ? "true" : "false"}
      hidden={open ? undefined : true}
      data-wide={wide ? "true" : undefined}
      data-testid={`rec-fold-${id}`}
      onKeyDown={recKeys({ onCancel, onSave, saving, refused })}
    >
      <div className="rec-fold-head">
        <span className="rec-fold-label" id={labelId}>{label}</span>
        <span className="rec-fold-hint">{hint}</span>
        <button type="button" className="rec-fold-close" id={closeId} aria-labelledby={`${closeId} ${labelId}`} onClick={onCancel} data-testid={`rec-fold-close-${id}`}>
          {closeLabel}
        </button>
      </div>
      <div className="rec-fold-body">
        <div className="rec-fold-inner">
          {children}
          <RecordSays testid={`rec-fold-says-${id}`} text={says} label={saysLabel} />
          {confirm}
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
            note={note}
          />
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
  keys = "Esc cancels · ⌘↵ saves", gate = null, children = null,
}) => {
  const box = useFoldRef(null);
  useRecFocus(id, open, !!confirm, box, ".rec-inline-body", null);
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
      data-open={open ? "true" : "false"}
      hidden={open ? undefined : true}
      data-testid={`rec-inline-${id}`}
      onKeyDown={recKeys({ onCancel, onSave, saving, refused })}
    >
      <span className="rec-inline-key" id={keyId}>{label}</span>
      <div className="rec-inline-body">
        {disputed && Dispute ? <Dispute id={id} disputed={{ value: disputed.value, source: disputed.source, sentence: disputed.sentence }} /> : null}
        {children}
        <RecordSays id={`rec-inline-${id}-says`} testid={`rec-inline-says-${id}`} text={says} label={saysLabel} gone={gone} goneLabel={goneLabel} note={note} inline />
        {confirm}
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

Object.assign(window, { RecordFold, RecordInline, RecordSays, useRecordFold, __recordFolds: recFolds });
