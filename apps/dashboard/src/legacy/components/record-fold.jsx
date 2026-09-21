/* global React */
// Chanlytics record kit: the fold, and the rule that only one is open.
//
// A set of fields opens under the row that states them. Its head keeps the row's label where it was and puts the
// page's hint where the value was; its act becomes Close. Under its fields, a fold can show what saving it will
// write (`says`, under the page's own eyebrow, `saysLabel`), and its foot carries its own Save and Cancel. The page
// decides whether it is open, what its fields are and what saving does; the kit knows none of it.
//
//   <RecordFold id="booking_rules" label="Booking rules" hint="…" open says={block} saysLabel="…"
//               onSave={save} onCancel={cancel} saving={busy} gate={window.gate("settings", "change the booking rules")}>
//     …fields…
//   </RecordFold>
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
// then opens). close(id) from a fold that is not the open one does nothing. reset() forgets everything.
// subscribe(fn) hears every change.

const { useRef: useFoldRef, useEffect: useFoldEffect } = React;

const recFolds = (() => {
  let openId = null;
  let openDirty = null;
  let asked = null;
  const subs = new Set();
  // A check that throws is taken as holding changes: asking once too often loses nothing.
  const dirty = () => {
    if (!openId || typeof openDirty !== "function") return false;
    try { return !!openDirty(); } catch { return true; }
  };
  // The browser asks before the tab closes over a dirty fold. The listener is on only while a fold is open, as
  // BusinessEditor's was only while it held changes, and it asks the fold at the moment the tab closes.
  const hold = (e) => { if (!dirty()) return; e.preventDefault(); e.returnValue = ""; };
  const tell = () => {
    window.removeEventListener("beforeunload", hold);
    if (openId) window.addEventListener("beforeunload", hold);
    for (const fn of [...subs]) fn();
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
      if (!openId || !dirty()) { become(id, check); return true; }
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
    reset() { become(null); },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
  };
})();

// The Settings rail's one question before it replaces a pane (settings.jsx SettingsPage): does anything on it hold
// unsaved changes? The open fold answers for itself. The kit sets this once, as it loads, before any pane can mount.
// Anything else that can hold unsaved changes adds its own answer to this one and puts it back when it goes, as
// BusinessEditor does until the record replaces it; nothing replaces it outright.
window.__settingsUnsaved = () => recFolds.dirty();

// The first thing in an opened fold a person would type into or press, never its Save or Cancel.
const REC_FOLD_FIRST = '.rec-fold-inner :is(input, textarea, select, button:not([tabindex="-1"]), [tabindex="0"]):not([disabled]):not(.rec-fold-foot *)';
const recFoldFocusIn = (el) => {
  if (!el || !el.querySelector) return;
  const first = el.querySelector(REC_FOLD_FIRST) || el.querySelector(".rec-fold-close");
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
  gate = null, children = null,
}) => {
  const foldRef = useFoldRef(null);
  useFoldEffect(() => {
    if (!open) return undefined;
    const el = foldRef.current;
    recFoldFocusIn(el);
    return () => recFoldFocusBack(id, el);
  }, [open, id]);
  const labelId = `rec-fold-${id}-label`;
  const closeId = `rec-fold-${id}-close`;
  const refused = !!(gate && gate["aria-disabled"]);
  const onKey = (e) => {
    if (e.defaultPrevented) return;
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

Object.assign(window, { RecordFold, __recordFolds: recFolds });
