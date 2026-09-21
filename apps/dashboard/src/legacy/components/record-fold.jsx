/* global React */
// Chanlytics record kit: the fold, and the rule that only one is open.
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
// replaces a pane. A page asks it to open a fold with request(id, { dirty }), where `dirty` says whether that fold
// holds unsaved changes once it is open. A clean fold gives way at once; a dirty one stays open and the registry
// records { holding, wants } until one of three answers: discard() (throw its changes away and open the one asked
// for), stay() (keep editing it), or close(id) from the holding fold itself (saved or cancelled; the one asked for
// then opens). close(id) from a fold that is not the open one does nothing. subscribe(fn) hears every change. A page
// reaches all of this through useRecordFold rather than by hand.
// Two are not for pages: drawn(id) is RecordFold's own (it counts the folds with each id on the page, and when the
// last one with the open id goes, the registry lets go), and reset() is for tests (it forgets what is open and asked).

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
  // "Nothing open" is null, never merely falsy: a fold may be called 0 or "". A check that throws is taken as holding
  // changes: asking once too often loses nothing.
  const dirty = () => {
    if (openId == null || typeof openDirty !== "function") return false;
    try { return !!openDirty(); } catch { return true; }
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
    request(id, { dirty: check } = {}) {
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
    // For tests: forget what is open and what is asked. The folds counted on the page stay counted; they are the page's.
    reset() { become(null); },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
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
// `dirty` is the fold's unsaved-changes test, a boolean or a function, read whenever the registry asks. `asking` is
// the registry's { holding, wants } while a fold holds, or null.
const recSameAsk = (a, b) => (a ? a.holding : null) === (b ? b.holding : null) && (a ? a.wants : null) === (b ? b.wants : null);
const useRecordFold = (id, { dirty = false } = {}) => {
  const read = () => ({ open: recFolds.open() === id, asking: recFolds.asking() });
  const [seen, setSeen] = useFoldState(read);
  const dirtyNow = useFoldRef(dirty);
  dirtyNow.current = dirty;
  useFoldEffect(() => {
    const hear = () => setSeen((was) => { const now = read(); return was.open === now.open && recSameAsk(was.asking, now.asking) ? was : now; });
    hear();
    return recFolds.subscribe(hear);
  }, [id]);
  const holds = () => { const d = dirtyNow.current; return typeof d === "function" ? !!d() : !!d; };
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

// The first thing in an opened fold a person would type into or press: the first of its fields' tab stops (data-bits
// tabStops), never a tip (the mark that explains a label comes before its box) and never its Save or Cancel.
const recFoldFocusIn = (el) => {
  if (!el || !el.querySelector) return;
  const inner = el.querySelector(".rec-fold-inner");
  const stops = inner && window.tabStops ? window.tabStops(inner) : [];
  const first = stops.find((c) => !c.classList.contains("rec-tip") && !c.closest(".rec-fold-foot")) || el.querySelector(".rec-fold-close");
  if (first && first.focus) first.focus();
};
// Closed, or gone: focus that went with the fold (it is on nothing, or still inside it) comes back to the act of the
// row the fold opened from. Focus a person has put somewhere else stays there.
const recFoldFocusBack = (id, el) => {
  const now = document.activeElement;
  const lost = !now || now === document.body || (el && el.contains && el.contains(now)) || (document.contains && !document.contains(now));
  if (!lost || !document.querySelector) return;
  const back = document.querySelector(`[data-rec-act="${id}"]`);
  if (back && back.focus) back.focus();
};

const RecordFold = ({
  id, label, hint = null, open = true, says = null, saysLabel = null, note = null,
  onSave, onCancel, saving = false, saveLabel = "Save", savingLabel = "Saving…", cancelLabel = "Cancel", closeLabel = "Close",
  gate = null, wide = false, children = null,
}) => {
  const foldRef = useFoldRef(null);
  useFoldEffect(() => {
    if (!open) return undefined;
    const el = foldRef.current;
    recFoldFocusIn(el);
    return () => recFoldFocusBack(id, el);
  }, [open, id]);
  // A fold whose page goes away (the rail's "Yes, leave" replaces the pane) lets go of the registry: left as the open
  // fold, its dirty check would go on answering after it had gone, and the rail would ask on every tab and the
  // browser before every reload. The registry counts the folds on the page by id (drawn), so a fold that comes
  // straight back (StrictMode, in development) or comes back as a new instance (a key change, a new parent) keeps
  // hold. A fold closed, or given way to another, before it goes is no longer the open one, and leaves it alone.
  useFoldEffect(() => recFolds.drawn(id), [id]);
  const labelId = `rec-fold-${id}-label`;
  const closeId = `rec-fold-${id}-close`;
  const refused = !!(gate && gate["aria-disabled"]);
  const onKey = (e) => {
    // Only the fold's own keys: a portal's bubble through React from outside the fold's DOM (a sheet drawn from a
    // field inside it), and its Ctrl+Enter would save the fold.
    if (e.defaultPrevented || !e.currentTarget.contains(e.target)) return;
    if (e.key === "Escape" && onCancel) { e.preventDefault(); onCancel(); return; }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSave && !saving && !refused) { e.preventDefault(); onSave(); }
  };
  const writes = typeof says === "string" && says.trim() !== "";
  return (
    <div
      ref={foldRef}
      className="rec-fold"
      role="group"
      aria-labelledby={labelId}
      data-open={open ? "true" : "false"}
      hidden={open ? undefined : true}
      data-wide={wide ? "true" : undefined}
      data-testid={`rec-fold-${id}`}
      onKeyDown={onKey}
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
          {writes ? (
            <div className="rec-fold-says" data-testid={`rec-fold-says-${id}`}>
              {saysLabel ? <span className="rec-fold-says-eyebrow">{saysLabel}</span> : null}
              <pre>{says}</pre>
            </div>
          ) : null}
          <div className="rec-fold-foot">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={onSave}
              disabled={saving}
              aria-busy={saving || undefined}
              data-testid={`rec-fold-save-${id}`}
              {...(gate || {})}
            >
              {saving ? savingLabel : saveLabel}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel} data-testid={`rec-fold-cancel-${id}`}>{cancelLabel}</button>
            {note ? <span className="rec-fold-note">{note}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { RecordFold, useRecordFold, __recordFolds: recFolds });
