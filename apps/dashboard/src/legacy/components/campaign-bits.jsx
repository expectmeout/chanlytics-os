/* global React, Icon */
// Campaigns' shared parts: what Playbooks, Broadcasts and Templates each open on.
//
// The three pages opened on a one-line standing sentence and a toolbar with a
// hairline of its own, and each drew its sections with its own furniture. The
// canvas opens every one of them the same way: a headline and ONE line under it,
// with the page's own act at the right. That is not the header #556-#558 took
// away -- a title the top bar repeated, a sub-headline that ran to six lines at
// 390px and a three-cell stat strip, about 590px of a phone before the first
// message. This is 22px and 12.5px, about fifty pixels, and it wraps rather
// than grows.

/**
 * The page head.
 *
 *   title   the page's name, as the tab says it
 *   badge   a state beside the name, for a head that names one thing (an opened run)
 *   sub     one line under it: the page's numbers, or what it holds
 *   right   the page's own act, or a state that outranks it
 */
const CmHead = ({ title, badge = null, sub = null, right = null, testid = null }) => (
  <header className="cm-head" data-testid={testid || undefined}>
    <div className="cm-head-text">
      {badge
        ? <div className="cm-head-line"><h1 className="cm-head-title">{title}</h1>{badge}</div>
        : <h1 className="cm-head-title">{title}</h1>}
      {sub && <div className="cm-head-sub">{sub}</div>}
    </div>
    {right && <div className="cm-head-right">{right}</div>}
  </header>
);

/** The dot between the parts of a head's line: a separator a screen reader skips. */
const CmDot = () => <span className="cm-head-dot" aria-hidden="true">·</span>;

/**
 * A state that asks for the owner, said at the right of a head: "2 waiting on
 * you". The tone is the vocabulary's (tone.ts); this never picks one.
 */
const CmFlag = ({ tone = "warn", children, testid = null }) => (
  // The house pill in the tone (components.css): it was a 28px flag of its own, the largest badge in the app.
  <span className={`pill pill-${tone} cm-flag`} data-tone={tone} data-testid={testid || undefined}>
    {children}
  </span>
);

/**
 * A notice that sits between the head and the list: one bold sentence saying
 * what is true, the rest saying what it costs, and the one act that fixes it.
 */
const CmBanner = ({ tone = "warn", lead, children = null, act = null, testid = null }) => (
  <div className="cm-banner" data-tone={tone} data-testid={testid || undefined}>
    <Icon name={tone === "plain" ? "info" : "notice"} size={15} />
    <span className="cm-banner-text">
      <strong>{lead}</strong>
      {children ? <> {children}</> : null}
    </span>
    {act}
  </div>
);


/**
 * One language of one message, drawn: filled when WhatsApp approved it, dotted
 * while WhatsApp reads it, struck through when WhatsApp refused it, and an open
 * dashed ring for a language the message does not exist in. The colour is the
 * vocabulary's (tone.ts, through the chrome bridge); `status` null is absence.
 */
const CmLangGlyph = ({ status = null, size = 12 }) => {
  const said = status && window.__chrome && window.__chrome.state ? window.__chrome.state("template", status) : null;
  const tone = said ? said.tone : "none";
  return (
    <svg className="cm-lang-glyph" data-tone={tone} width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" r="5.1" fill={tone === "ok" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeDasharray={!said ? "2 2.1" : tone === "info" ? "1.3 2.3" : undefined} />
      {tone === "danger" && <path d="M3.8 10.2 L10.2 3.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
    </svg>
  );
};

/* ---- The language picker ------------------------------------------------------
   A message is one thing in every language it has, so it has ONE language
   control: a chip that says the language in view and opens every language
   there is -- the ones WhatsApp holds, with their state; the ones the starter
   library has written; and every other language WhatsApp takes -- found by
   typing a name in English or in its own words, a place, or a code. It was a
   slot per language on every row, "EN ES" down a page of sixteen messages, and
   a language nobody had written could not be reached from it at all. */

// Under a thumb the list is a sheet from the foot of the screen: the width at
// which mobile.css makes the shell a phone.
const LP_SHEET = "(max-width: 720px)";
const lpSheet = () => { try { return !!(window.matchMedia && window.matchMedia(LP_SHEET).matches); } catch (e) { return false; } };
// The contracts' search (findLanguages): a code, an English name, the language's
// own name, a place. Without the library read, a plain match on the words.
const lpFind = (q, list) => (window.__starters && window.__starters.findLanguages
  ? window.__starters.findLanguages(q, list)
  : list.filter((c) => !q.trim() || String(c.label).toLowerCase().includes(q.trim().toLowerCase())));
// What stands at the right of a language: its state at WhatsApp in the app's one
// vocabulary (tone.ts, through the chrome bridge), else its own name when that
// is not its English one -- "Deutsch" beside German, nothing beside English.
const lpSaid = (status) => (status && window.__chrome && window.__chrome.state ? window.__chrome.state("template", status).label : null);
const lpHint = (c) => (c.hint !== undefined ? c.hint : c.status ? lpSaid(c.status) : c.native && c.native !== c.name ? c.native : null);
const lpTone = (status) => {
  if (status === undefined) return undefined;
  const said = status && window.__chrome && window.__chrome.state ? window.__chrome.state("template", status) : null;
  return said ? said.tone : "none";
};
// The list goes on the document's body, so nothing it opens from can clip it -- or, opened inside a modal (the
// playbook composer's sheet), on the modal: a screen reader keeps to a modal dialog, and a list drawn outside it
// could not be reached.
const lpHost = (el) => (el && el.closest ? el.closest('[aria-modal="true"]') : null) || document.body;
const lpPortal = (node, host) => (window.ReactDOM && window.ReactDOM.createPortal && host ? window.ReactDOM.createPortal(node, host) : node);
let lpSeq = 0;

/**
 * value     the language in view: "en_US"
 * choices   [{ id, label, name, native, group?, status? }] -- contracts messageLanguageChoices, or any list of languages
 * groups    the headings by group ({ on: "On WhatsApp", ... }); a group with none has none
 * onPick    (id, choice) when a language is chosen
 * status    the glyph for the language in view: a status, null for "not on WhatsApp", undefined for no glyph
 * tag       the chip's letters: "EN"
 * more      how many more languages the message has, said "+1" beside the letters
 * display   "tag" (the letters) or "label" (the words, with a globe: a form's field)
 * label     what the control is for, for a screen reader: "Language for Win-back"
 * search    whether to offer the search box; by default when there are more than seven
 * note      one line under the list: why something is not offered
 * size      "md", or "sm" for a chip inside a chip
 *
 * It is the one list that opens from a control on Campaigns, so it lists more
 * than languages -- a playbook's moment and its message open it too:
 *
 * face         what the control shows instead of the letters: a moment with its glyph, a message's title
 * fit          "trigger": the list as wide as its control, under it
 * triggerClass the control's own class beside the picker's
 * searchWords  { placeholder, empty(q) } for a list of something other than languages
 * and a choice may carry `icon` (a glyph in place of the language's state) and `sub` (a line under its label).
 */
const CmPicker = ({ value, choices = [], groups = {}, onPick, status, tag = null, more = 0, display = "tag", label = "Language", search = null, searchWords = null, note = null, size = "md", face = null, fit = null, triggerClass = "", disabled = false, testid = null }) => {
  const [open, setOpen] = React.useState(false);
  const [typed, setQ] = React.useState("");
  // Always words, whatever the cell was handed.
  const q = typeof typed === "string" ? typed : "";
  const [active, setActive] = React.useState(0);
  const [pos, setPos] = React.useState(null);
  const trigger = React.useRef(null);
  const pop = React.useRef(null);
  const input = React.useRef(null);
  const list = React.useRef(null);
  const uid = React.useRef(null);
  if (uid.current === null) uid.current = `lp${++lpSeq}`;
  const searching = search === null ? choices.length > 7 : !!search;
  // What the search finds, kept in its groups: a match's rank decides its place
  // WITHIN a group, and the groups keep their order, so a heading never repeats.
  const order = [...new Set(choices.map((c) => c.group || ""))];
  const found = searching && q.trim() ? lpFind(q, choices) : choices;
  const rank = new Map(found.map((c, i) => [c.id, i]));
  const shown = found.slice().sort((a, b) => order.indexOf(a.group || "") - order.indexOf(b.group || "") || rank.get(a.id) - rank.get(b.id));
  const current = choices.find((c) => c.id === value) || null;
  const words = display === "label" ? (current ? current.label : value) : (tag || String(value || "").slice(0, 2).toUpperCase());

  const close = (back) => {
    setOpen(false);
    setQ("");
    setPos(null);
    if (back && trigger.current && trigger.current.focus) trigger.current.focus();
  };
  const choose = (c) => {
    if (!c) return;
    close(true);
    if (onPick) onPick(c.id, c);
  };
  // Where the list goes: under its chip, or over it when the room is above; a
  // sheet under a thumb. Measured as it opens, so its first frame is already in
  // place -- a list drawn hidden until an effect placed it could not take the
  // focus the search box needs, and the first keys typed went nowhere.
  const measure = () => {
    if (lpSheet()) return { sheet: true };
    const t = trigger.current;
    if (!t || !t.getBoundingClientRect) return null;
    const r = t.getBoundingClientRect();
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const width = Math.min(fit === "trigger" ? Math.max(r.width, 260) : size === "sm" ? 256 : 304, vw - 16);
    const left = Math.max(8, Math.min(display === "label" || fit === "trigger" ? r.left : r.left - 6, vw - width - 8));
    const below = vh - r.bottom - 16;
    const above = r.top - 16;
    const up = below < 260 && above > below;
    const maxHeight = Math.max(180, Math.min(420, up ? above : below));
    return up ? { left, width, maxHeight, bottom: vh - r.top + 6 } : { left, width, maxHeight, top: r.bottom + 6 };
  };
  const toggle = () => {
    if (disabled) return;
    if (open) { close(false); return; }
    setQ("");
    setActive(Math.max(0, choices.findIndex((c) => c.id === value)));
    setPos(measure());
    setOpen(true);
  };

  // Open: kept in place while anything scrolls or the window changes, closed by
  // a press anywhere else -- a listener on the document, because a backdrop
  // cannot cover the page from inside a list that is its own container -- and
  // the search box takes the keys at once, except under a thumb, where a
  // keyboard over half the sheet is not what a tap asked for.
  React.useEffect(() => {
    if (!open) return undefined;
    const sheet = lpSheet();
    // Moved only when it moved: scrolling the list itself is not the page moving,
    // and a scroll tick that changed nothing redraws nothing.
    const same = (a, b) => !!(a && b) && ["left", "top", "bottom", "width", "maxHeight", "sheet"].every((k) => a[k] === b[k]);
    const place = () => { const at = measure(); if (at) setPos((was) => (same(was, at) ? was : at)); };
    const onScroll = (e) => { if (pop.current && pop.current.contains && pop.current.contains(e.target)) return; place(); };
    const onDown = (e) => {
      const within = (el) => !!(el && el.contains && el.contains(e.target));
      if (!within(pop.current) && !within(trigger.current)) close(false);
    };
    // Esc closes it wherever the focus went; inside the list the list's own keys take it first.
    const onEsc = (e) => { if (e.key === "Escape") close(true); };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onEsc);
    document.addEventListener("pointerdown", onDown, true);
    const focus = () => {
      const el = searching && !sheet ? input.current : list.current;
      if (el && el.focus) el.focus({ preventScroll: true });
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(focus); else focus();
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onEsc);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, display, searching, size, fit]); // eslint-disable-line react-hooks/exhaustive-deps -- measure is this draw's; the listeners live while it is open

  // The option the keys are on stays in sight as the arrows walk the list.
  React.useEffect(() => {
    if (!open || !document.getElementById) return;
    const el = document.getElementById(`${uid.current}-o${active}`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [open, active, q]);

  const onKey = (e) => {
    const last = shown.length - 1;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, last)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "PageDown") { e.preventDefault(); setActive((a) => Math.min(a + 8, last)); }
    else if (e.key === "PageUp") { e.preventDefault(); setActive((a) => Math.max(a - 8, 0)); }
    else if ((e.key === "Home" || e.key === "End") && e.target !== input.current) { e.preventDefault(); setActive(e.key === "Home" ? 0 : last); }
    else if (e.key === "Enter") { e.preventDefault(); choose(shown[Math.min(active, last)]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    // Back to its control, and the key goes on from there: the next stop is the one after the control, as a select's is.
    else if (e.key === "Tab") close(true);
  };

  const sections = [];
  shown.forEach((c, i) => {
    const g = c.group || "";
    const at = sections[sections.length - 1];
    if (at && at.group === g) at.items.push({ c, i });
    else sections.push({ group: g, items: [{ c, i }] });
  });
  const optId = (i) => `${uid.current}-o${i}`;
  const onActive = shown[Math.min(active, shown.length - 1)] ? optId(Math.min(active, shown.length - 1)) : undefined;
  const sheet = !!(pos && pos.sheet);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`lp-trigger lp-${size}${display === "label" ? " lp-as-label" : ""}${face ? " lp-as-face" : ""}${triggerClass ? ` ${triggerClass}` : ""}${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current ? current.label : words}${more > 0 ? `, and ${more} more` : ""}`}
        disabled={disabled}
        onClick={(e) => { if (e && e.stopPropagation) e.stopPropagation(); toggle(); }}
        onKeyDown={(e) => {
          // Open, the list takes the keys once it has the focus; a key pressed on the control before then is still
          // the list's. Escape here closed the sheet the control sits in, and Tab left the list open behind it.
          if (open) {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); } else if (e.key === "Tab") close(false);
            return;
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); toggle(); }
        }}
        data-tone={lpTone(status)}
        data-testid={testid || undefined}
      >
        {face || (
          <>
            {display === "label" ? <Icon name="globe" size={13} /> : status !== undefined ? <CmLangGlyph status={status} size={12} /> : null}
            <span className="lp-words">{words}</span>
            {more > 0 && <span className="lp-more tally" aria-hidden="true">+{more}</span>}
          </>
        )}
        <span className="lp-caret" aria-hidden="true"><Icon name="chevron-down" size={10} /></span>
      </button>
      {open && lpPortal(
        <>
          {sheet && <div className="lp-backdrop" onClick={() => close(false)} aria-hidden="true" />}
          <div
            ref={pop}
            className={`lp-pop lp-pop-${size}${sheet ? " is-sheet" : ""}`}
            style={pos && !pos.sheet ? { left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, maxHeight: pos.maxHeight } : undefined}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onKey}
            data-testid={testid ? `${testid}-pop` : undefined}
          >
            {searching && (
              <div className="lp-search">
                <Icon name="search" size={14} />
                <input
                  ref={input}
                  type="text"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={`${uid.current}-list`}
                  aria-autocomplete="list"
                  aria-activedescendant={onActive}
                  aria-label={(searchWords && searchWords.placeholder) || "Search languages"}
                  placeholder={(searchWords && searchWords.placeholder) || "Search languages"}
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setActive(0); }}
                  spellCheck={false}
                  autoComplete="off"
                  data-testid={testid ? `${testid}-search` : undefined}
                />
                {q && <button type="button" className="lp-clear" aria-label="Clear the search" onClick={() => { setQ(""); setActive(0); if (input.current && input.current.focus) input.current.focus(); }}><Icon name="x" size={12} /></button>}
              </div>
            )}
            <div ref={list} className="lp-list" id={`${uid.current}-list`} role="listbox" aria-label={label} aria-activedescendant={onActive} tabIndex={-1}>
              {sections.map((sec) => (
                <div className="lp-group" role="group" aria-label={groups[sec.group] || undefined} key={sec.group || "all"}>
                  {groups[sec.group] && <div className="lp-group-head" aria-hidden="true">{groups[sec.group]}</div>}
                  {sec.items.map(({ c, i }) => {
                    const hint = lpHint(c);
                    return (
                      <div
                        key={c.id}
                        id={optId(i)}
                        role="option"
                        aria-selected={c.id === value}
                        className={`lp-opt${i === active ? " is-active" : ""}${c.id === value ? " is-on" : ""}${c.sub ? " has-sub" : ""}`}
                        onMouseMove={() => { if (i !== active) setActive(i); }}
                        onClick={() => choose(c)}
                        data-lang={c.id}
                        data-group={c.group || undefined}
                        data-testid={testid ? `${testid}-option` : undefined}
                      >
                        <span className="lp-opt-mark" aria-hidden="true">{c.icon ? <Icon name={c.icon} size={14} /> : c.status !== undefined ? <CmLangGlyph status={c.status} size={12} /> : null}</span>
                        <span className="lp-opt-label">{c.sub ? <><span className="lp-opt-main">{c.label}</span><span className="lp-opt-sub">{c.sub}</span></> : c.label}</span>
                        {hint && <span className="lp-opt-hint" data-tone={c.status ? lpTone(c.status) : undefined}>{hint}</span>}
                        <span className="lp-opt-check" aria-hidden="true">{c.id === value ? <Icon name="check" size={14} /> : null}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {shown.length === 0 && <div className="lp-empty" role="status">{searchWords && searchWords.empty ? searchWords.empty(q.trim()) : <>No language called “{q.trim()}”</>}</div>}
            </div>
            {note && <p className="lp-note" data-testid={testid ? `${testid}-note` : undefined}>{note}</p>}
          </div>
        </>,
        lpHost(trigger.current),
      )}
    </>
  );
};

/**
 * Who a run will actually reach, with the subtractions named: the number that
 * gets it, out of how many, a bar of the two -- those it reaches, those held
 * back -- and one line per reason anybody is held back.
 *
 *   will     how many get it
 *   pool     out of how many
 *   of       what the pool is, after "of 36": "who said yes"
 *   held     how many of the pool are held back (the amber part of the bar)
 *   reasons  [{ t, tone, door? }]: "12 heard from a playbook this week"; a door is { words, to }
 */
const CmReach = ({ will, pool, of = null, held = 0, reasons = [], size = "md", progress = null, label = null, testid = null }) => {
  const total = Math.max(pool, will + held, 1);
  const w = Math.round((Math.min(will, total) / total) * 100);
  const h = Math.round((Math.min(held, total - will) / total) * 100);
  return (
    <div className={`cm-reach cm-reach-${size}`} data-testid={testid || undefined}>
      <div className="cm-reach-n">
        <span className="cm-reach-will tabular">{will}</span>
        <span className="cm-reach-of">of <span className="tabular">{pool}</span>{of ? ` ${of}` : ""}</span>
      </div>
      {/* A send in flight is a progress bar a screen reader can hear; otherwise the bar is a picture of the numbers above it. */}
      <div className="cm-reach-bar" {...(progress === null ? { "aria-hidden": "true" } : { role: "progressbar", "aria-label": label || "Sent so far", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(progress * 100) })}>
        {w > 0 && <span className="cm-reach-bar-will" style={{ width: `${w}%` }} />}
        {h > 0 && <span className="cm-reach-bar-held" style={{ width: `${h}%` }} />}
        <span className="cm-reach-bar-rest" />
      </div>
      {reasons.length > 0 && (
        <ul className="cm-reach-why">
          {reasons.map((r, i) => (
            <li key={i}>
              <span className="cm-reach-dot" data-tone={r.tone || "plain"} aria-hidden="true" />
              {r.t}
              {/* The one reason an owner can act on opens where they act on it. */}
              {r.door && <button type="button" className="cm-reach-door" onClick={() => window.CHANLY.nav(r.door.to)} data-testid={testid ? `${testid}-door` : undefined}>{r.door.words}</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** The last few runs as bars of what each sent, oldest first: a shape, not a chart. */
const CmSpark = ({ values = [], label = null }) => {
  if (!values.length) return null;
  const top = Math.max(...values, 1);
  return (
    <span className="cm-spark" aria-label={label || undefined} role={label ? "img" : undefined}>
      {values.map((v, i) => <span key={i} className="cm-spark-bar" style={{ height: `${Math.max(v > 0 ? 3 : 1, Math.round((v / top) * 15))}px` }} />)}
    </span>
  );
};

// The picker was made for a message's languages, and a language is still what it opens on by default.
const LanguagePicker = CmPicker;

Object.assign(window, { CmHead, CmDot, CmFlag, CmBanner, CmLangGlyph, CmPicker, LanguagePicker, CmReach, CmSpark });
