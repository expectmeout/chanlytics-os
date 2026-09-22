/* global React, Icon */
// Chanlytics — Settings › Business: What you offer.
//
// The third card of the record (docs/superpowers/specs/2026-09-20-business-tab-design.md §4.4; the canvas's Record,
// Edit-Sheet and Edit-Fold boards): the services, the booking rules, and what needs a consult first, each edited where
// it is stated. The services are a list: thirty-three rows of three boxes on the live record, the "99 inputs in a 720px
// column" the redesign exists to remove, so they open a sheet beside the page (BtSheet). The booking rules are five
// numbers and a box of notes, a fold (BtFold). And consult-first, one of the two unlabelled textareas the old form had,
// is a fold of its own with its own name. It replaces the form's "What you offer" and "Booking rules" sections
// (BusinessEditor, settings.jsx), and what those learned came with them, comments and all.
//
// The page composes and never derives. Every sentence here with a number in it is contracts' (servicesWords,
// servicesToldWords, servicesSaveWords, bookingRulesWords, BOOKING_RULE_HINTS, through window.__businessTab); what a
// fold or the sheet opens with, refuses and writes is business-tab-folds.jsx's; the gestures are BtFold and BtSheet
// (business-tab-gestures.jsx), read from window as each draws.
//
// Two components. The card (BtOfferCard), and the services sheet (BtServicesSheet), which the PAGE draws after every
// card, never this card: the kit's sheet holds hooks and is drawn only while it is open, and the tests' stub React keeps
// every hook on the page as a cell in one order, so the sheet must be the page's last hook-holding child (BtSheet says
// why). Drawn here, the cards after this one (How it answers, What it can do) would have read its cells as their own
// whenever it opened. The card's services row asks the registry for the sheet by its id, as the standing line's door
// does, and the sheet is open while the registry says so.
//
// Loaded after business-tab-open.jsx and before business-tab.jsx (both load lists), and read there as
// window.BtOfferCard and window.BtServicesSheet. Its top-level names are btw-prefixed, and no pattern in it holds an
// object rest, for the reasons business-tab-save.jsx gives. The sheet's rows come and go (an Add, a remove, a search),
// so they are drawn hookless (the kit's RecordBox), as a fold's rows are.

const { useState: useBtwState, useRef: useBtwRef } = React;

/* ------------------------------------ the services ------------------------------------ */

// A name as the search reads it: contracts' foldName (availability.ts, through the bridge), accents off and case
// folded, so "unas" finds "Uñas de gel" as a caller's words find a service, with the space around it trimmed as
// needsConsultation trims it. The page once folded names with a copy of that rule, which agreed until one changed.
const btwFolded = (s) => {
  const fold = window.__businessTab && window.__businessTab.foldName;
  const words = String(s == null ? "" : s).trim();
  // With no bridge to ask, a name is compared as it is written: nothing here folds it a second way.
  return fold ? fold(words) : words;
};

// What the sheet says when a list is full: the cap the save's schema keeps (LIMITS.services), said where Add was.
const btwFull = (max) => `That is the most services the receptionist keeps (${max}). Remove one first.`;

/**
 * The services list inside the sheet's draft, with every rule a list has (BtFold's rows: the cap through Add and
 * through an Undo, a removal said only when it happened, the row back at its index, the field keys each row's
 * sentences are under, and focus in a row just added), and the rows an Undo may still put back, each where it would go
 * (waiting), which the sheet draws an Undo for in the row's place.
 */
const btwServiceRows = (rows) => {
  const max = window.__businessTabSave.LIMITS.services;
  return rows({
    id: "services",
    name: (i) => `service-${i}`,
    max,
    blank: () => ({ name: "" }),
    keysOf: (i) => [`service-${i}-name`, `service-${i}-duration_min`, `service-${i}-price_note`],
    key: "services",
    full: btwFull(max),
  });
};

/**
 * The row at rest (the canvas's Record board): how many are on record, the first four by name with how long each
 * takes, and one sentence about how they are priced, all contracts' (servicesWords). Its act opens the sheet, by asking
 * the registry for its id: the one door, as the standing line's is, so a fold open elsewhere with changes is asked
 * about first. A role that may not change the business is offered no act, and nor is anyone while the sheet could not
 * open (BtSheet.opens: nothing read to save onto, or a list whose draft cannot be worked out), as a fold offers none then.
 */
const BtwServicesRow = ({ brain, canEdit, gate, saver }) => {
  const tab = window.__businessTab || {};
  const vm = tab.servicesWords ? tab.servicesWords((brain.profile || {}).services) : null;
  const has = !!(vm && vm.count);
  const opens = !!(window.BtSheet && window.BtSheet.opens && window.BtSheet.opens("services", saver));
  return (
    <window.RecordRow
      id="services"
      label="Services"
      value={has ? vm.line : null}
      empty="None yet"
      act={canEdit && opens ? {
        label: has ? "Open the list" : "Add one",
        name: has ? "Open the list of services" : "Add one: a service",
        onClick: () => { if (window.__recordFolds) window.__recordFolds.request("services"); },
        gate,
      } : null}
    >
      {has ? <window.RecordChips chips={vm.chips.map((c) => ({ label: c.name, meta: c.takes }))} more={vm.more} testid="rec-services-chips" /> : null}
      {has && vm.priced ? <span className="bt-services-priced" data-testid="rec-services-priced">{vm.priced}</span> : null}
    </window.RecordRow>
  );
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
 */
const BtwServicesSheet = ({ brain, canEdit, flash, saver }) => {
  const S = window.__businessTabSave;
  const tab = window.__businessTab || {};
  const [search, setSearch] = useBtwState({ opening: 0, q: "" });
  // Each row changed since the sheet opened, and the search in force when it changed (the header says why). A row is
  // changed when it is not one the sheet opened with: rows() makes a new one for each keystroke, each row added, and
  // each row put back, so the first draw a row is seen in is the moment it changed.
  const pins = useBtwRef(null);
  if (!pins.current) pins.current = new WeakMap();
  const Sheet = window.BtSheet;
  if (!Sheet) return null;
  // Whether a service needs a consultation first is contracts' one question (needsConsultation), the one the Calendar's
  // board asks of the same list: a row marked here is a service the receptionist offers as a consultation.
  const rules = (brain.profile || {}).booking_rules || null;
  const consults = (name) => !!(tab.needsConsultation && tab.needsConsultation(String(name == null ? "" : name), rules));
  const written = (draft) => S.WRITTEN_ROWS.services(draft).length;

  const tools = (f) => {
    const svc = btwServiceRows(f.rows);
    const q = search.opening === f.opening ? search.q : "";
    return (
      <>
        <span className="bt-services-search">
          <Icon name="search" size={12} />
          <window.RecordBox
            id="bt-services-search" label="Search services" type="search" value={q} placeholder="Search services"
            onChange={(v) => setSearch({ opening: f.opening, q: v })} autoComplete="off" spellCheck={false} testid="rec-services-search"
          />
        </span>
        {/* The write schema takes no more than this, so the sheet does not offer it (rows' canAdd). */}
        {svc.canAdd ? (
          <button type="button" className="btn btn-sm" {...f.press(() => svc.add())} data-testid="rec-services-add">
            <Icon name="plus" size={12} /> Add
          </button>
        ) : (
          <span className="bt-fold-note" data-testid="rec-services-cap">{btwFull(S.LIMITS.services)}</span>
        )}
      </>
    );
  };

  const body = (f) => {
    const svc = btwServiceRows(f.rows);
    const list = f.draft || [];
    const q = btwFolded(search.opening === f.opening ? search.q : "");
    const opened = new Set(f.opened || []);
    list.forEach((x) => { if (x && !opened.has(x) && !pins.current.has(x)) pins.current.set(x, q); });
    const shows = (x) => !q || btwFolded(x.name).includes(q) || (!opened.has(x) && pins.current.get(x) === q);
    const marks = svc.waiting();
    const setSvc = (i, k, v) => svc.setAt(i, { [k]: v });
    // A service and a note are words somebody typed, the same as a closure, and each went with one press and no Undo (S18).
    const removeService = (i) => {
      const back = svc.removeAt(i, (gone) => <>Removed {gone.name ? <b>{gone.name}</b> : "a service"}</>);
      // Focus was on the remove, which went with its row: it goes to the Undo left in the row's place.
      if (back) f.focus(`service-gone-${back.id}`);
    };
    const said = (key) => f.problems[key] || null;
    const mark = (m) => (
      <div key={`gone-${m.id}`} className="bt-service-gone" data-rec-row={`service-gone-${m.id}`} data-testid={`rec-service-gone-${m.at}`}>
        <span className="bt-service-gone-words">Removed {m.row && m.row.name ? <b>{m.row.name}</b> : "a service"}</span>
        <button
          type="button" className="bt-link"
          {...f.press(() => { const at = m.at; if (m.back()) f.focus(`service-${at}`); })}
          data-testid={`rec-service-undo-${m.at}`}
        >Undo</button>
      </div>
    );
    const drawn = [];
    list.forEach((x, i) => {
      marks.filter((m) => m.at === i).forEach((m) => drawn.push(mark(m)));
      const n = i + 1;
      drawn.push(
        <div key={`svc-${i}`} className="bt-service-row" hidden={shows(x) ? undefined : true} data-testid={`rec-service-${i}`} {...svc.row(i)}>
          <span className="bt-service-name">
            <window.RecordBox
              id={`svc-${i}-name`} label={`Service ${n} name`} size="sm" value={x.name} placeholder="What customers call it"
              onChange={(v) => setSvc(i, "name", v)} problem={said(`service-${i}-name`)} readOnly={f.readOnly}
            />
            {consults(x.name) ? <span className="bt-service-consult" data-testid={`rec-service-consult-${i}`}>consult first</span> : null}
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
    return (
      <div className="bt-services" data-testid="rec-services-rows">
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

/* ------------------------------------ the booking rules ------------------------------------ */

// The five numbers, in the fold's order (the canvas's Edit-Fold), each with its label, its unit, and the old grid's
// placeholder for its box. Each box is named by its label and unit, the words on screen (WCAG 2.5.3): the old grid's
// names were kept as a second name, and "Offers times up to" was heard as "Days ahead", which nobody saying the words
// on screen could reach. Their ranges are business-tab-folds.jsx's RULES, and what an empty box means is contracts'
// (BOOKING_RULE_HINTS).
const BTW_RULE_BOXES = [
  ["lead_hours", "Least notice", "hours", "2"],
  ["slot_min", "Slot length", "minutes", "30"],
  ["buffer_min", "Gap between appointments", "minutes", "0"],
  ["max_days_ahead", "Offers times up to", "days ahead", "14"],
  ["party_max", "Most people per booking", "people", "4"],
];

/**
 * The booking rules' fields: five numbers, each under its own label with its unit and what an empty box means, and the
 * notes one to a line. Drawn on every render (BtFold's rule), and none comes or goes, so each is the kit's
 * RecordField. A number is kept as it is typed: the save's checks refuse a non-digit or a number outside its range
 * under its box (problemsOf, the old form's sentences), where the old grid stripped anything but digits as it was
 * typed and saved "2.5" as 25. A box takes no min or max: a text box ignores both, and the range is said in the
 * refusal (business-tab-folds.jsx RULES), under the box, where the hint was.
 */
const BtwRules = ({ draft, update, problems, readOnly }) => {
  const hints = (window.__businessTab || {}).BOOKING_RULE_HINTS || {};
  return (
    <div className="bt-rules" data-testid="rec-rules-boxes">
      <div className="bt-rules-grid">
        {BTW_RULE_BOXES.map(([key, label, unit, placeholder]) => (
          <window.RecordField
            key={key}
            id={`bt-rule-${key}`}
            label={label}
            unit={unit}
            hint={hints[key] || null}
            value={draft[key]}
            onChange={(v) => update((d) => ({ ...d, [key]: v }), [key])}
            problem={problems[key] || null}
            inputMode="numeric"
            placeholder={placeholder}
            readOnly={readOnly || undefined}
            testid={`rec-rule-${key}`}
          />
        ))}
      </div>
      <window.RecordField
        id="bt-rule-notes"
        label="Anything else about booking, one per line"
        rows={3}
        value={draft.notes}
        onChange={(v) => update((d) => ({ ...d, notes: v }), ["notes"])}
        problem={problems.notes || null}
        placeholder={"No chemical services after 4 PM\nBridal parties are booked by phone"}
        readOnly={readOnly || undefined}
        testid="rec-rule-notes"
      />
    </div>
  );
};

/**
 * What needs a consult first: one box, one service to a line, under the old form's sentence for it. The fold's own
 * label names it, the words on screen above it (RecordFold's rec-fold-<id>-label); a second name, as the old form gave
 * it, is one a person saying the words on screen could not reach.
 */
const BtwConsult = ({ draft, update, problems, readOnly }) => (
  <window.RecordField
    id="bt-consult-first"
    label={null}
    aria-labelledby="rec-fold-consult_first-label"
    rows={3}
    value={draft}
    onChange={(v) => update(() => v, ["consult_first"])}
    problem={problems.consult_first || null}
    hint="Services that need a consultation before they can be booked, one per line."
    placeholder={"Color correction\nExtensions"}
    readOnly={readOnly || undefined}
    testid="rec-consult-first"
  />
);

/* ------------------------------------ the card ------------------------------------ */

/**
 * What you offer (spec §4.4): the services, the rules for booking them, and the ones that need a consult first.
 * Consult-first is stored inside the booking rules, and its fold and the rules' fold each write only their own keys of
 * it (business-tab-folds.jsx PATHS_OF), so saving one never puts the other's back as it was.
 *
 * `brain` is the settings read's, which the rows state; what a fold opens with and saves onto is the saver's base,
 * which BtFold asks for itself.
 */
const BtOfferCard = ({ brain, canEdit, flash, saver }) => {
  const tab = window.__businessTab || {};
  const Fold = window.BtFold;
  const profile = brain.profile || {};
  const rules = profile.booking_rules || {};
  const gate = (thing) => window.gate("settings", `change ${thing}`);
  const shared = { canEdit, flash, saver };
  const said = tab.bookingRulesWords ? tab.bookingRulesWords(rules) : { line: null, notes: null, none: null };
  const consult = (rules.consult_first || []).join(", ");

  return (
    <section className="rec-card" data-testid="rec-card-offer" aria-labelledby="bt-offer-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-offer-title">What you offer</h2>
        <span className="rec-card-sub">And the rules for offering it</span>
      </div>

      <BtwServicesRow brain={brain} canEdit={canEdit} gate={gate("your services")} saver={saver} />

      <Fold
        {...shared}
        id="booking_rules"
        label="Booking rules"
        hint="It never books. It says which times are open and sends the link."
        footNote="Saves these five rules and the notes, and nothing else on the page."
        gate={gate("the booking rules")}
        row={{
          value: said.line,
          // With none of the five set, what the openings are worked out with, which is not "no rule".
          empty: said.none,
          children: said.notes ? <span className="bt-rules-notes" data-testid="rec-rules-notes">{said.notes}</span> : null,
          act: "Change",
          name: "Change the booking rules",
        }}
        body={(f) => <BtwRules {...f} />}
      />

      <Fold
        {...shared}
        id="consult_first"
        label="Needs a consult first"
        gate={gate("what needs a consult first")}
        row={{
          value: consult || null,
          empty: "None",
          name: consult ? "Change what needs a consult first" : "Add one: a service that needs a consult first",
        }}
        body={(f) => <BtwConsult {...f} />}
      />
    </section>
  );
};

Object.assign(window, { BtOfferCard, BtServicesSheet: BtwServicesSheet });
