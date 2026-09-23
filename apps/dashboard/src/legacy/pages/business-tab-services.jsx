/* global React, Icon */
// Chanlytics — Settings › Business: the services sheet.
//
// What you offer's list of services, in a sheet beside the page (docs/superpowers/specs/2026-09-20-business-tab-design.md
// §4.4 and §5; the canvas's Edit-Sheet board): thirty-three rows of three boxes on the live record, the "99 inputs in a
// 720px column" the redesign exists to remove. A search and Add above the rows, the rows in three columns with a remove
// each, and a foot that says what the receptionist will be told. Its row at rest is the card's (business-tab-offer.jsx
// BtwServicesRow), whose act asks the registry for this sheet by its id, as the standing line's door does.
//
// A file of its own because the PAGE draws it, through its one sheet slot after every card, never the card: the fold
// registry opens one editor or sheet at a time, and the slot draws one sheet or none (business-tab.jsx BtSheetSlot).
//
// The page composes and never derives: every sentence here with a number in it is contracts' (servicesToldWords,
// servicesSaveWords, through window.__businessTab); what the sheet opens with, refuses and writes is
// business-tab-folds.jsx's; the gesture is BtSheet (business-tab-gestures.jsx), read from window as it draws.
//
// Loaded after business-tab-offer.jsx and before business-tab.jsx (both load lists), and read there as
// window.BtServicesSheet. Its top-level names are bts-prefixed, and no pattern in it holds an object rest, for the
// reasons business-tab-save.jsx gives. Its rows come and go (an Add, a remove, a search), so they are drawn hookless (the
// kit's RecordBox), as a fold's rows are: they are drawn before the kit's sheet's own hooks.

const { useState: useBtsState, useRef: useBtsRef } = React;

// A name as the search reads it: contracts' foldName (availability.ts, through the bridge), accents off and case
// folded, so "unas" finds "Uñas de gel" as a caller's words find a service, with the space around it trimmed as
// needsConsultation trims it. The page once folded names with a copy of that rule, which agreed until one changed.
const btsFolded = (s) => {
  const fold = window.__businessTab && window.__businessTab.foldName;
  const words = String(s == null ? "" : s).trim();
  // With no bridge to ask, a name is compared as it is written: nothing here folds it a second way.
  return fold ? fold(words) : words;
};

// What the sheet says when a list is full: the cap the save's schema keeps (LIMITS.services), said where Add was.
const btsFull = (max) => `That is the most services the receptionist keeps (${max}). Remove one first.`;

/**
 * The services list inside the sheet's draft, with every rule a list has (BtFold's rows: the cap through Add and
 * through an Undo, a removal said only when it happened, the row back at its index, the field keys each row's
 * sentences are under, and focus in a row just added), and the rows an Undo may still put back, each where it would go
 * (waiting), which the sheet draws an Undo for in the row's place.
 */
const btsServiceRows = (rows) => {
  const max = window.__businessTabSave.LIMITS.services;
  return rows({
    id: "services",
    name: (i) => `service-${i}`,
    max,
    blank: () => ({ name: "" }),
    keysOf: (i) => [`service-${i}-name`, `service-${i}-duration_min`, `service-${i}-price_note`],
    key: "services",
    full: btsFull(max),
  });
};

/**
 * The services sheet (the canvas's Edit-Sheet): a search and Add above the rows, the rows in three columns (Service,
 * Takes, Price) with a remove each, and the foot's "It will be told" over its Save. Drawn by the page, last (the
 * header says why), over the one editor a fold is (BtSheet).
 *
 * The search narrows the rows by name and NEVER reorders them: the stored order is the order the receptionist reads
 * them in, and a sheet sorted by its search would save them sorted. A row it leaves out is hidden, not taken off the
 * page, so every row keeps its index and its boxes their focus. A row changed since the sheet opened (typed in, just
 * added, or put back) is pinned to the search in force when it changed, and stays in sight under that search: a name
 * typed over until it no longer matched would have taken its row, and the box being typed in, out of sight, and a row
 * put back while another name was searched came back hidden (the quality review's P6). Under a later search it is
 * searched like any other; pinned to every later one, a row changed once stayed in every search after.
 *
 * A row taken out leaves an Undo where it was, inside the sheet, since the toast's Undo is outside the dialog's Tab ring
 * (record-sheet.jsx); the toast still says it and offers the same Undo, which does nothing once the sheet has closed
 * and says so. Either puts the row back once, between the same two rows it went from, and each Undo is drawn where its
 * row would go back, which moves as rows are taken out and put back around it: both are rows()' (waiting), so every
 * list keeps them. What the search holds is kept for one opening of the sheet (the editor's `opening`).
 *
 * A row whose name is on the consult-first list carries a "consult first" mark, to read: that list is its own fold's.
 * The mark describes the row's name box (aria-describedby), after what is wrong with the name, if anything.
 */
const BtsServicesSheet = ({ brain, canEdit, flash, saver }) => {
  const S = window.__businessTabSave;
  const tab = window.__businessTab || {};
  const [search, setSearch] = useBtsState({ opening: 0, q: "" });
  // Each row changed since the sheet opened, and the search in force when it changed (the header says why). A row is
  // changed when it is not one the sheet opened with: rows() makes a new one for each keystroke, each row added, and
  // each row put back, so the first draw a row is seen in is the moment it changed.
  const pins = useBtsRef(null);
  if (!pins.current) pins.current = new WeakMap();
  const Sheet = window.BtSheet;
  if (!Sheet) return null;
  // Whether a service needs a consultation first is contracts' one question (needsConsultation), the one the Calendar's
  // board asks of the same list: a row marked here is a service the receptionist offers as a consultation.
  const rules = (brain.profile || {}).booking_rules || null;
  const consults = (name) => !!(tab.needsConsultation && tab.needsConsultation(String(name == null ? "" : name), rules));
  const written = (draft) => S.WRITTEN_ROWS.services(draft).length;

  const tools = (f) => {
    const svc = btsServiceRows(f.rows);
    const q = search.opening === f.opening ? search.q : "";
    return (
      <>
        <span className="bt-services-search">
          <Icon name="search" size={12} />
          <window.RecordBox
            id="bt-services-search" label="Search services" type="search" value={q} placeholder="Search services"
            onChange={(v) => setSearch({ opening: f.opening, q: v })} autoComplete="off" spellCheck={false} testid="rec-services-search"
            // Escape with words in the search clears them, and goes no further: the sheet's Escape closed it, or asked, over a
            // search a person only meant to empty. Not preventDefault, which would stop the box's own clear. Empty, the key
            // is the sheet's.
            onKeyDown={(e) => { if (e.key === "Escape" && q !== "") { e.stopPropagation(); setSearch({ opening: f.opening, q: "" }); } }}
          />
        </span>
        {/* The write schema takes no more than this, so the sheet does not offer it (rows' canAdd). */}
        {svc.canAdd ? (
          <button type="button" className="btn btn-sm" {...f.press(() => svc.add())} data-testid="rec-services-add">
            <Icon name="plus" size={12} /> Add
          </button>
        ) : (
          <span className="bt-fold-note" data-testid="rec-services-cap">{btsFull(S.LIMITS.services)}</span>
        )}
      </>
    );
  };

  const body = (f) => {
    const svc = btsServiceRows(f.rows);
    const list = f.draft || [];
    const q = btsFolded(search.opening === f.opening ? search.q : "");
    const opened = new Set(f.opened || []);
    list.forEach((x) => { if (x && !opened.has(x) && !pins.current.has(x)) pins.current.set(x, q); });
    const shows = (x) => !q || btsFolded(x.name).includes(q) || (!opened.has(x) && pins.current.get(x) === q);
    const marks = svc.waiting();
    const setSvc = (i, k, v) => svc.setAt(i, { [k]: v });
    // A service and a note are words somebody typed, the same as a closure, and each went with one press and no Undo (S18).
    const removeService = (i) => {
      const back = svc.removeAt(i, (gone) => <>Removed {gone.name ? <b>{gone.name}</b> : "a service"}</>);
      // Focus was on the remove, which went with its row: it goes to the Undo left in the row's place.
      if (back) f.focus(`service-gone-${back.id}`);
    };
    const said = (key) => f.problems[key] || null;
    // Each Undo is known by its put-back's id, not its place: two waiting in one gap shared a place, and shared an id.
    // Its name is what it puts back (contracts serviceUndoName), and holds the word on it (WCAG 2.5.3).
    const mark = (m) => (
      <div key={`gone-${m.id}`} className="bt-service-gone" data-rec-row={`service-gone-${m.id}`} data-testid={`rec-service-gone-${m.id}`}>
        <span className="bt-service-gone-words">Removed {m.row && m.row.name ? <b>{m.row.name}</b> : "a service"}</span>
        <button
          type="button" className="bt-link"
          aria-label={tab.serviceUndoName ? tab.serviceUndoName(m.row && m.row.name) : undefined}
          {...f.press(() => { const at = m.at; if (m.back()) f.focus(`service-${at}`); })}
          data-testid={`rec-service-undo-${m.id}`}
        >Undo</button>
      </div>
    );
    const drawn = [];
    list.forEach((x, i) => {
      marks.filter((m) => m.at === i).forEach((m) => drawn.push(mark(m)));
      const n = i + 1;
      // The mark describes the row's name box, so it is heard with the box it stands beside, not as a word on its own.
      const consult = consults(x.name) ? `svc-${i}-consult` : null;
      drawn.push(
        <div key={`svc-${i}`} className="bt-service-row" hidden={shows(x) ? undefined : true} data-testid={`rec-service-${i}`} {...svc.row(i)}>
          <span className="bt-service-name">
            <window.RecordBox
              id={`svc-${i}-name`} label={`Service ${n} name`} size="sm" value={x.name} placeholder="What customers call it"
              onChange={(v) => setSvc(i, "name", v)} problem={said(`service-${i}-name`)} readOnly={f.readOnly}
              aria-describedby={consult || undefined}
            />
            {consult ? <span id={consult} className="bt-service-consult" data-testid={`rec-service-consult-${i}`}>consult first</span> : null}
          </span>
          <window.RecordBox
            id={`svc-${i}-minutes`} label={`Service ${n} takes, in minutes`} size="sm" unit="min" inputMode="numeric" placeholder="45"
            value={x.duration_min == null ? "" : String(x.duration_min)} onChange={(v) => setSvc(i, "duration_min", v)}
            problem={said(`service-${i}-duration_min`)} readOnly={f.readOnly}
          />
          <window.RecordBox
            id={`svc-${i}-price`} label={`Service ${n} price`} size="sm" value={x.price_note || ""} placeholder="quoted at consult"
            onChange={(v) => setSvc(i, "price_note", v)} problem={said(`service-${i}-price_note`)} readOnly={f.readOnly}
          />
          <button
            type="button" className="btn btn-ghost btn-icon btn-sm"
            aria-label={`Remove ${x.name ? x.name : `service ${n}`}`}
            {...f.press(() => removeService(i))}
            data-testid={`rec-service-remove-${i}`}
          ><Icon name="x" size={11} /></button>
        </div>,
      );
    });
    marks.filter((m) => m.at >= list.length).forEach((m) => drawn.push(mark(m)));
    const none = q && list.length > 0 && !list.some(shows);
    // What the search has left in sight, said politely to a screen reader as it narrows (contracts servicesFoundWords):
    // the rows it hides are hidden, which nothing announces. Drawn from the sheet's first draw, empty with no search, so
    // the region is on the page before it has anything to say, and a change in it is heard.
    const found = q && tab.servicesFoundWords ? tab.servicesFoundWords(list.filter(shows).length, list.length) : "";
    return (
      <div className="bt-services" data-testid="rec-services-rows">
        <span className="rec-sr" role="status" aria-live="polite" data-testid="rec-services-found">{found}</span>
        {list.length > 0 ? (
          <div className="bt-service-row bt-service-head" aria-hidden="true">
            <span>Service</span><span>Takes</span><span>Price</span><span />
          </div>
        ) : null}
        {drawn}
        {none ? <p className="bt-fold-note" data-testid="rec-services-none">No service is called that. The search reads names only.</p> : null}
      </div>
    );
  };

  // What it will be told, in contracts' words: how many services the save writes, their block's share of the prompt
  // (willSay's chars, over the whole prompt the draft would give it on WhatsApp, willSay's total: both after the save;
  // the stored prompt's length put a block after the save over a prompt before it, and a large edit skewed the share),
  // and, where the save crosses the resolver's line, the sentence for it. The list's own refusal (too many) is said here
  // too, by the Save it stops.
  const told = (f) => {
    const words = tab.servicesToldWords
      ? tab.servicesToldWords({ count: written(f.draft), chars: f.will ? f.will.chars : null, total: f.will ? f.will.total : null })
      : null;
    return (
      <div className="bt-services-told" data-testid="rec-sheet-services-told">
        {f.will && f.will.note ? <p className="bt-services-note" data-testid="rec-sheet-services-note">{f.will.note}</p> : null}
        {words ? (
          <p className="bt-services-told-line">
            <span className="bt-services-told-key">It will be told</span>
            <span data-testid="rec-sheet-services-told-words">{words}</span>
          </p>
        ) : null}
        <window.FieldError id="bt-services-problem" message={f.problems.services || null} testid="rec-services-problem" />
      </div>
    );
  };

  return (
    <Sheet
      id="services"
      title="What you offer"
      sub="Names and rough timings. A price only if you can state it flatly."
      className="bt-services-sheet"
      canEdit={canEdit}
      flash={flash}
      saver={saver}
      gate={window.gate("settings", "change your services")}
      saveLabel={(f) => (tab.servicesSaveWords ? tab.servicesSaveWords(written(f.draft)) : "Save")}
      footNote="Removing one offers an undo."
      tools={tools}
      told={told}
      body={body}
    />
  );
};

Object.assign(window, { BtServicesSheet: BtsServicesSheet });
