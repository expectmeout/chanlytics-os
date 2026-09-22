/* global React, Icon */
// Chanlytics — Settings › Business, as a record.
//
// The tab was two surfaces that disagreed about what exists: a card showing nine facts, and a form editing about
// twenty-five behind one Save. Here every fact is a row, and a row is edited where it is stated
// (docs/superpowers/specs/2026-09-20-business-tab-design.md; the canvas's Record, Group-Who and Edit-Inline boards).
// This file draws the head and the standing line, and composes the cards. The page's two gestures, a row edited in its
// place (BtRow), a set of fields folded open under its row (BtFold) and a list in a sheet beside the page (BtSheet), are
// pages/business-tab-gestures.jsx; each card is a file of its own (business-tab-who.jsx, business-tab-open.jsx,
// business-tab-offer.jsx), loaded before this one and read from window as the page draws, and the services sheet
// (business-tab-services.jsx) is drawn here, after every card. The other groups arrive with Task 3.5, and PaneWorkspace (settings.jsx) keeps drawing
// the old card until Task 3.7 swaps this page in.
//
// The page composes and never derives. Every sentence with a number or a judgement in it is contracts', through
// window.__businessTab (legacy-bridge/business-tab.ts); every fact is the settings read's (window.__SETTINGS,
// window.__FACTS), read as the page draws. What a save writes is pages/business-tab-save.jsx's, through
// window.__businessTabSave: each row's check and patch, and the tab's one saver. That file loads before this one.
//
// The tests' stub React (tooling/scripts/tests/_legacy-react.mjs) keeps every hook on the page as a cell in one order,
// so a component holding hooks that is drawn on one render and not the next moves every cell after it. So every
// component on the page that holds one is drawn on every render (business-tab-gestures.jsx says how the gestures keep
// to it), and what comes and goes (a row at rest, a Confirm, a note) holds none. That is the stub's rule, not React's,
// which keeps each component's hooks with the component: nothing here needs shaping further for React's sake. And no
// object rest in a pattern anywhere in this file: the standalone mockup compiles every file into one global
// scope, where Babel's `_excluded` for a rest is shared, and the last file compiled decides what every earlier rest
// leaves out (record-field.jsx says how that bit).

const { useState: useBizState, useEffect: useBizEffect } = React;

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
 * like any other, and one open elsewhere holding changes is asked about first. The services sheet is not a fold, and
 * opens the same way: it holds the registry under its id as a fold does (BtSheet), and is open while the registry says
 * so. A row this page does not draw yet (the voice arrives with Task 3.5) opens, guarded the same way, once its fold is
 * here.
 */
const btOpenRow = (id) => {
  if (window.__recordFolds) window.__recordFolds.request(id);
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
      {/* Each card is a file of its own (business-tab-who.jsx, business-tab-open.jsx, business-tab-offer.jsx), read from
          window as the page draws. */}
      {window.BtWhoCard ? <window.BtWhoCard brain={brain} base={base} canEdit={canEdit} flash={flash} saver={saver} /> : null}
      {window.BtOpenCard ? <window.BtOpenCard brain={brain} config={settings.config} prompt={settings.prompt || null} canEdit={canEdit} flash={flash} saver={saver} /> : null}
      {window.BtOfferCard ? <window.BtOfferCard brain={brain} canEdit={canEdit} flash={flash} saver={saver} /> : null}
      {/* The services sheet, LAST, after every card: the kit's sheet holds hooks and is drawn only while it is open, and
          the tests' stub React keeps every hook on the page as a cell in one order, so drawn before a card it shifted
          that card's cells whenever it opened (BtSheet, business-tab-gestures.jsx; the sheet is business-tab-services.jsx).
          Whatever card comes next goes above this line. */}
      {window.BtServicesSheet ? <window.BtServicesSheet brain={brain} canEdit={canEdit} flash={flash} saver={saver} /> : null}
    </>
  );
};

Object.assign(window, { BusinessTab });
