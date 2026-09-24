/* global React, Icon */
// Chanlytics — Settings › Business: What you offer.
//
// The third card of the record (docs/superpowers/specs/2026-09-20-business-tab-design.md §4.4; the canvas's Record,
// Edit-Sheet and Edit-Fold boards): how customers buy, the services, the booking rules, and what needs a consult first,
// each edited where it is stated. How customers buy is the workspace's answer, not a key of the settings, and saves
// through the workspace's own door (docs/decisions/0008, "One switch"; BtwSellsBy, below). The services are a list:
// thirty-three rows of three boxes on the live record, the "99 inputs in a 720px column" the redesign exists to remove,
// so they open a sheet beside the page (BtSheet). The booking rules are five numbers and a box of notes, a fold
// (BtFold). And consult-first, one of the two unlabelled textareas the old form had, is a fold of its own with its own
// name. It replaces the form's "What you offer" and "Booking rules" sections (BusinessEditor, settings.jsx), and what
// those learned came with them, comments and all.
//
// The page composes and never derives. Every sentence here with a number in it is contracts' (servicesWords,
// servicesToldWords, servicesSaveWords, bookingRulesWords, BOOKING_RULE_HINTS, through window.__businessTab), and so is
// every word of how customers buy (sellsByVM, sellsBySaved); what a fold or the sheet opens with, refuses and writes is
// business-tab-folds.jsx's; the gestures are BtFold and BtSheet (business-tab-gestures.jsx), read from window as each
// draws.
//
// The services sheet is a file of its own (business-tab-services.jsx), which the PAGE draws after every card: the
// card's services row asks the registry for the sheet by its id, as the standing line's door does, and the sheet is
// open while the registry says so.
//
// Loaded after business-tab-open.jsx and before business-tab-services.jsx (both load lists), and read by the page as
// window.BtOfferCard. It holds no hook of its own (its folds hold theirs). Its top-level names are btw-prefixed, and no
// pattern in it holds an object rest, for the reasons business-tab-save.jsx gives.

/* ------------------------------------ how customers buy ------------------------------------ */

/** The active workspace's answer to how its customers buy, as the workspace list carries it (0008); null is never said. */
const btwAnswerNow = () => {
  const ws = (window.__WORKSPACES || []).find((t) => t.id === window.__ACTIVE_WORKSPACE) || null;
  return (ws && ws.sells_by) || null;
};

/**
 * The two answers as a choice, each with what choosing it means under it (the kit's RecordToggleGroup with its hints),
 * and what stops a Save under them. Every word is the view model's (contracts sellsByVM, through window.__businessTab).
 * Drawn by the fold below and by the create card (business-tab-create.jsx), so the choice and its words are written
 * once. `id` names the group, and its options' words and its refusal are named from it; `label` draws the question
 * over it, where nothing else on screen says it (the create card), and `labelledBy` points at what does (the fold's own
 * label). Hookless.
 */
const btwSellsByChoice = ({ id, vm, value, set, problem = null, readOnly = false, label = false, labelledBy = null, testid }) => (
  <div className="rec-field" data-testid={testid}>
    {label ? <span className="rec-field-label" id={`${id}-label`}>{vm.question}</span> : null}
    <window.RecordToggleGroup
      id={id}
      label={vm.question}
      labelledBy={label ? `${id}-label` : labelledBy}
      value={value}
      options={vm.choices}
      onChange={set}
      readOnly={readOnly}
      testid={`${testid}-choice`}
    />
    <window.FieldError id={`${id}-problem`} message={problem} testid={`${testid}-problem`} />
  </div>
);

/**
 * How customers buy (0008): they book an appointment, or some get a proposal first, which is what switches the whole
 * deal layer on (contracts dealsAreOn). The row states the answer, or that it was never said; its fold is the choice.
 *
 * The answer is the workspace's (tenants.sells_by), not a key of the settings, as the zone is: it saves through the
 * workspace's own door (business-tab-save.jsx `sellsBy`, window.__workspace.patch, PATCH workspaces) and never through
 * the settings save, where it could not live (0008: a key inside a section is refused by an older edge, and one beside
 * them dropped by an older page's next save). So the act is offered only where there is a door to save it through and
 * the role may change the business: an owner, the timezone's gate. It writes nothing the receptionist is told (the
 * bridge's FOLD_BLOCK), so its fold says nothing it will be told. Once taken, the toast says what it switched, and
 * People, Reports and Today are read again (refresh-map.ts), so the deals come or go without a reload. A Save with
 * nothing chosen, on a workspace never asked, says why under the choice.
 */
const BtwSellsBy = ({ vm, answer, canEdit, gate, flash }) => {
  const Fold = window.BtFold;
  const door = window.__businessTabSave.sellsBy;
  const tab = window.__businessTab || {};
  return (
    <Fold
      id="sells_by"
      label={vm.question}
      canEdit={canEdit && !!window.__workspace}
      gate={gate}
      flash={flash}
      door={{
        initial: answer,
        save: (next, done) => door.save({ answer: next, said: tab.sellsBySaved ? tab.sellsBySaved(answer, next) : null, done, flash }),
        pending: () => door.pending(),
      }}
      check={(d) => (d ? {} : { sells_by: vm.refusal })}
      row={{ value: vm.value, empty: vm.empty, act: vm.act, name: vm.name }}
      body={(f) => btwSellsByChoice({
        id: "bt-sells-by",
        vm,
        value: f.draft,
        set: (v) => f.update(() => v, ["sells_by"]),
        problem: f.problems.sells_by || null,
        readOnly: f.readOnly,
        labelledBy: "rec-fold-sells_by-label",
        testid: "rec-sells-by",
      })}
    />
  );
};

/* ------------------------------------ the services ------------------------------------ */

/**
 * The row at rest (the canvas's Record board): how many are on record and the first three by name, contracts'
 * (servicesWords). It said how they were priced too, on a line of its own under the names, which was "None names a
 * price." on nearly every record (24 Sep): the sheet is where a price is written. Its act opens the sheet, by asking
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
    </window.RecordRow>
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
        label="Anything else about booking"
        hint="One per line."
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
 * What you offer (spec §4.4): how customers buy (0008), the services, the rules for booking them, and the ones that
 * need a consult first. Consult-first is stored inside the booking rules, and its fold and the rules' fold each write
 * only their own keys of it (business-tab-folds.jsx PATHS_OF), so saving one never puts the other's back as it was.
 * Where deals are on, its row says what a consultation for them starts (sellsByVM's consultHint).
 *
 * `brain` is the settings read's, which the rows state; what a fold opens with and saves onto is the saver's base,
 * which BtFold asks for itself. How customers buy is the workspace list's, which its door keeps current.
 */
const BtOfferCard = ({ brain, canEdit, flash, saver }) => {
  const tab = window.__businessTab || {};
  const Fold = window.BtFold;
  const profile = brain.profile || {};
  const rules = profile.booking_rules || {};
  const gate = (thing) => window.gate("settings", `change ${thing}`);
  const shared = { canEdit, flash, saver };
  const said = tab.bookingRulesWords ? tab.bookingRulesWords(rules) : { line: null, notes: null, none: null };
  // A stored list that is not one (a hand-edited record) is none: joined as it stood, it threw as the card drew.
  const consult = (Array.isArray(rules.consult_first) ? rules.consult_first : []).join(", ");
  const answer = btwAnswerNow();
  const buys = tab.sellsByVM ? tab.sellsByVM(answer) : null;

  return (
    <section className="rec-card" data-testid="rec-card-offer" aria-labelledby="bt-offer-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-offer-title">What you offer</h2>
        <span className="rec-card-sub">And the rules for offering it</span>
      </div>

      {buys ? <BtwSellsBy vm={buys} answer={answer} canEdit={canEdit} gate={gate("how customers buy")} flash={flash} /> : null}

      <BtwServicesRow brain={brain} canEdit={canEdit} gate={gate("your services")} saver={saver} />

      <Fold
        {...shared}
        id="booking_rules"
        label="Booking rules"
        hint="It never books. It says which times are open and sends the link."
        footNote="Saves these five rules and the notes, and nothing else on the page."
        gate={gate("the booking rules")}
        row={{
          // The notes follow the sentence on its line, in the dim ink (24 Sep): under it they were a second line on a
          // row that states one fact.
          value: said.line ? (
            <>
              {said.line}
              {said.notes ? " · " : null}
              {said.notes ? <span className="bt-rules-notes" data-testid="rec-rules-notes">{said.notes}</span> : null}
            </>
          ) : null,
          // With none of the five set, what the openings are worked out with, which is not "no rule"; the notes, if
          // any, stand under it.
          empty: said.none,
          children: !said.line && said.notes ? <span className="bt-rules-notes" data-testid="rec-rules-notes">{said.notes}</span> : null,
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
          hint: buys ? buys.consultHint : null,
          name: consult ? "Change what needs a consult first" : "Add one: a service that needs a consult first",
        }}
        body={(f) => <BtwConsult {...f} />}
      />
    </section>
  );
};

// The choice of how customers buy is the create card's too (business-tab-create.jsx), which loads after this file.
Object.assign(window, { BtOfferCard, btSellsByChoice: btwSellsByChoice, btSellsByNow: btwAnswerNow });
