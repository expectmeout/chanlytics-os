/* global React, Icon */
// A message's language, as one control.
//
// Meta keeps a template once per name PER LANGUAGE, so a message in English and
// Spanish is two rows -- and the pages drew the rows: a slot per language on
// every Templates row, a toggle per language in every composer's chip, and a
// composer that could write in six languages. The owner has one message. This is
// its language: the one in view with its WhatsApp state drawn beside it, and a
// popover that puts another in view, finds any language WhatsApp takes -- by its
// name, its own name or its code -- and writes the message in it.
//
//   value     the language in view (a code)
//   options   this message's languages: { id, label, status, note, disabled }.
//             On file, `status` is Meta's; a starter's language the library has
//             written but the workspace has not added has none.
//   onChoose  called with an option's id
//   onWrite   called with a language the message does not have; null hides the
//             rest of the catalog
//   trigger   ({ open, toggle, current, others, short }) => the button, for a
//             page that draws its own; else the chip below
//   glyph     draw each language's state (false where every option can go)
//   field     a chooser for one language (the composer's): the trigger names it
//   testid    the page's name: `${testid}` on the trigger, `-option`, `-write`,
//             `-search`, `-pop` inside

const LangPicker = ({ value, options = [], onChoose, onWrite = null, trigger = null, glyph = true, field = false, testid = "lang", align = "left", label = "Language" }) => {
  const [open, setOpen] = React.useState(false);
  const [typed, setQ] = React.useState("");
  const q = typeof typed === "string" ? typed : "";
  const [at, setAt] = React.useState(0);
  const wrapRef = React.useRef(null);
  const S = window.__starters || null;
  const close = () => { setOpen(false); setQ(""); setAt(0); };
  // A press anywhere else closes it. A listener, not a backdrop: the lists this
  // sits in are measured as containers, and a container traps position:fixed.
  React.useEffect(() => {
    if (!open || typeof document === "undefined" || !document.addEventListener) return undefined;
    const away = (e) => { if (wrapRef.current && wrapRef.current.contains && !wrapRef.current.contains(e.target)) close(); };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [open]);
  const toggle = () => (open ? close() : setOpen(true));
  const said = (status) => (status && window.__chrome && window.__chrome.state ? window.__chrome.state("template", status) : null);
  const noteOf = (o) => o.note || (o.status ? (said(o.status) || {}).label || o.status : "Not added yet");
  const current = options.find((o) => o.id === value) || null;
  const find = (list) => (S && S.findLanguages ? S.findLanguages(list, q) : list);
  const mine = find(options);
  const have = new Set(options.map((o) => o.id));
  // A variant of a language the message already has -- "English" beside English (US), Spain's Spanish beside Spanish --
  // reads as the same language twice until it is asked for by name: typed, it is found like any other.
  const base = (id) => String(id).split(/[-_]/)[0];
  const bases = new Set(options.filter((o) => o.status).map((o) => base(o.id)));
  const more = onWrite && S && S.catalog ? find(S.catalog.filter((l) => !have.has(l.id) && (q.trim() || !bases.has(base(l.id))))) : [];
  // What the keys move over: what can be chosen, then what can be written.
  const items = [...mine.filter((o) => !o.disabled).map((o) => ({ kind: "choose", id: o.id })), ...more.map((l) => ({ kind: "write", id: l.id }))];
  const indexOf = (kind, id) => items.findIndex((it) => it.kind === kind && it.id === id);
  const act = (it) => { close(); if (it.kind === "choose") onChoose(it.id); else if (onWrite) onWrite(it.id); };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(i + 1, items.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter" && items[at]) { e.preventDefault(); act(items[at]); }
  };
  const short = S && S.langShort ? S.langShort(value || "") : String(value || "").slice(0, 2).toUpperCase();
  const name = current ? current.label : S && S.langName ? S.langName(value || "") : value;
  // The other languages this message is on file in: "+1" says there is more without drawing it twice.
  const others = options.filter((o) => o.status && o.id !== value).length;
  const button = trigger
    ? trigger({ open, toggle, current, others, short })
    : (
      <button
        type="button"
        className={`lang-chip${field ? " is-field" : ""}${open ? " open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${name}`}
        onClick={toggle}
        data-testid={testid}
      >
        {field ? <Icon name="globe" size={12} /> : glyph ? <window.CmLangGlyph status={current ? current.status : null} size={11} /> : null}
        <span className="lang-chip-k">{field ? name : short}</span>
        {!field && others > 0 && <span className="lang-chip-more">+{others}</span>}
        <Icon name="chevron-down" size={10} />
      </button>
    );
  return (
    <span className="lang-wrap" ref={wrapRef}>
      {button}
      {open && (
        <div className={`lang-pop align-${align}`} role="dialog" aria-label={label} onKeyDown={onKey} data-testid={`${testid}-pop`}>
          <label className="lang-find">
            <Icon name="search" size={12} />
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setAt(0); }}
              placeholder={onWrite ? "Find any language" : "Find a language"}
              aria-label="Find a language"
              data-testid={`${testid}-search`}
            />
          </label>
          <div className="lang-list" role="listbox" aria-label={label}>
            {mine.length > 0 && onWrite && <div className="lang-sec">This message</div>}
            {mine.map((o) => {
              const i = indexOf("choose", o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={o.id === value}
                  disabled={!!o.disabled}
                  className={`lang-opt${o.id === value ? " on" : ""}${i >= 0 && i === at ? " at" : ""}`}
                  onMouseEnter={() => { if (i >= 0) setAt(i); }}
                  onClick={() => act({ kind: "choose", id: o.id })}
                  data-testid={`${testid}-option`}
                  data-lang={o.id}
                >
                  {glyph && <window.CmLangGlyph status={o.status} size={11} />}
                  <span className="lang-opt-name">{o.label}</span>
                  {o.native && o.native !== o.label && <span className="lang-opt-native">{o.native}</span>}
                  {(glyph || o.note) && <span className="lang-opt-note">{noteOf(o)}</span>}
                  {o.id === value && <span className="lang-opt-on"><Icon name="check" size={12} /></span>}
                </button>
              );
            })}
            {more.length > 0 && <div className="lang-sec">Write it in another language</div>}
            {more.map((l) => {
              const i = indexOf("write", l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className={`lang-opt is-new${i === at ? " at" : ""}`}
                  onMouseEnter={() => setAt(i)}
                  onClick={() => act({ kind: "write", id: l.id })}
                  data-testid={`${testid}-write`}
                  data-lang={l.id}
                >
                  <span className="lang-opt-plus" aria-hidden="true"><Icon name="plus" size={10} /></span>
                  <span className="lang-opt-name">{l.label}</span>
                  {l.native !== l.label && <span className="lang-opt-native">{l.native}</span>}
                </button>
              );
            })}
            {mine.length === 0 && more.length === 0 && <div className="lang-none" data-testid={`${testid}-none`}>No language called “{q.trim()}” — WhatsApp takes {S && S.catalog ? S.catalog.length : "about seventy"}, by name or by their own name.</div>}
          </div>
        </div>
      )}
    </span>
  );
};

window.LangPicker = LangPicker;
