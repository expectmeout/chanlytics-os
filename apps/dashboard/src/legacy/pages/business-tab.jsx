/* global React, Icon */
// Chanlytics — Settings › Business, as a record.
//
// The tab was two surfaces that disagreed about what exists: a card showing nine facts, and a form editing about
// twenty-five behind one Save. Here every fact is a row, and a row is edited where it is stated
// (docs/superpowers/specs/2026-09-20-business-tab-design.md; the canvas's Record, Group-Who and Edit-Inline boards).
// This file draws the head and the standing line, and composes the cards. The page's two gestures, a row edited in its
// place (BtRow), a set of fields folded open under its row (BtFold) and a list in a sheet beside the page (BtSheet), are
// pages/business-tab-gestures.jsx; each card is a file of its own (business-tab-who.jsx, business-tab-open.jsx,
// business-tab-offer.jsx, business-tab-answers.jsx, business-can.jsx), loaded before this one and read from window as the page draws, and
// the two sheets, the services list (business-tab-services.jsx) and what the receptionist is told
// (business-tab-prompt.jsx), are drawn here through ONE slot, after every card (BtSheetSlot says why).
//
// The page composes and never derives. Every sentence with a number or a judgement in it is contracts', through
// window.__businessTab (legacy-bridge/business-tab.ts); every fact is the settings read's (window.__SETTINGS,
// window.__FACTS), read as the page draws. What a save writes is pages/business-tab-save.jsx's, through
// window.__businessTabSave: each row's check and patch, and the tab's one saver. That file loads before this one.
//
// Every component on the page that holds a hook is drawn on every render, and what comes and goes (a row at rest, a
// Confirm, a note) holds none: the tests' old stub React kept every hook on a page as a cell in one order, and this
// page was shaped to it. The stub now keeps each component's hooks where it sits, as React does, and throws as React
// does when a component's hooks change in number (tooling/scripts/tests/_hook-frames.mjs), so the shape stands as a
// habit and nothing new needs keeping to it. And no
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
 *
 * What it will not do lands differently on the two channels -- in chat the price is swapped before the reply is sent,
 * on a call it has been heard and what follows is a correction -- so the line is told which lines this workspace
 * answers on (the plan's M-1). Read off the voice line the settings read resolved, as How it answers reads it for the
 * hand-off row that names both channels: it arrives with the record this page cannot draw without, so there is no
 * moment where the band has to guess.
 */
const BtStanding = ({ brain, door }) => {
  const tab = window.__businessTab;
  if (!tab || !tab.standingLine) return null;
  const voice = ((window.__FACTS || {}).facts || {}).voice_line;
  const vm = tab.standingLine(brain, !!(voice && voice.value));
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
 * so. The voice's gap opens How it answers' voice fold (business-tab-answers.jsx) the same way.
 */
const btOpenRow = (id) => {
  if (window.__recordFolds) window.__recordFolds.request(id);
};

/**
 * The page's one sheet slot, drawn LAST of everything on the page that holds a hook, and drawing at most one sheet.
 *
 * The kit's RecordSheet is drawn only while it is open. Under the tests' old stub a sheet drawn before a card shifted
 * that card's cells whenever it opened (Task 3.4's note 3), which is why the slot is last; it no longer must be. The
 * fold registry opens one editor or sheet at a time, so the slot draws one of them or neither:
 *   - the services sheet's editor is held on every draw, since it binds its unsaved test to the registry and counts
 *     itself on the page (BtSheet), and it draws the kit's sheet only while the registry has "services" open;
 *   - the prompt sheet holds nothing here: the page holds its state before every card (useBtPromptSheet), and the sheet
 *     is drawn only while the registry has "prompt" open, after the services sheet's editor and never beside its sheet.
 * Whatever sheet comes next goes through this slot too (business-tab-prompt.test.mjs holds it to one sheet or none).
 *
 * A row's fold on a phone is a sheet as well (record-fold.jsx), and it is NOT drawn here. The slot is for what is drawn
 * only while open; a fold holds the same hooks open or closed, as a sheet or under its row, so it is drawn where its row
 * is and moves no cell after it. Both can be on the page because only one can be open: the registry opens one editor
 * or sheet at a time, so a row's sheet and this slot's never stand on screen together (business-tab-page.test.mjs).
 */
const BtSheetSlot = ({ prompt, brain, canEdit, flash, saver }) => (
  <>
    {window.BtServicesSheet ? <window.BtServicesSheet brain={brain} canEdit={canEdit} flash={flash} saver={saver} /> : null}
    {prompt && prompt.open && window.BtPromptSheet ? <window.BtPromptSheet prompt={prompt} brain={brain} canEdit={canEdit} /> : null}
  </>
);

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
  // And the settings surface read again (after a save, a zone saved through its own route, a conflict's re-read, a
  // Retry), which is where every row's value comes from: heard here, not only by whatever draws the page, since a zone
  // saved and read back left the card's "in New York time" and the closures counted on New York's day until something
  // else drew the page.
  const zone = window.__businessTabSave.zone;
  useBizEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const stops = [saver.subscribe(bump), zone ? zone.subscribe(bump) : null];
    window.addEventListener("surface:settings", bump);
    return () => {
      stops.forEach((stop) => { if (stop) stop(); });
      window.removeEventListener("surface:settings", bump);
    };
  }, [saver, zone]);
  // What the receptionist is told: the prompt sheet's hold on the registry and the channel it shows (business-tab-prompt.jsx),
  // held here, on every draw and before every card, so the told section at rest says the channel last chosen and the
  // sheet itself is the one thing that comes and goes, in the slot (BtSheetSlot).
  const prompt = window.useBtPromptSheet ? window.useBtPromptSheet() : null;
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
      {/* Each card is a file of its own (business-tab-who.jsx, business-tab-open.jsx, business-tab-offer.jsx,
          business-tab-answers.jsx), read from window as the page draws. */}
      {window.BtWhoCard ? <window.BtWhoCard brain={brain} base={base} canEdit={canEdit} flash={flash} saver={saver} /> : null}
      {window.BtOpenCard ? <window.BtOpenCard brain={brain} config={settings.config} prompt={settings.prompt || null} canEdit={canEdit} flash={flash} saver={saver} /> : null}
      {window.BtOfferCard ? <window.BtOfferCard brain={brain} canEdit={canEdit} flash={flash} saver={saver} /> : null}
      {window.BtAnswersCard ? <window.BtAnswersCard brain={brain} base={base} config={settings.config} canEdit={canEdit} flash={flash} saver={saver} /> : null}
      {window.BtCanCard ? <window.BtCanCard brain={brain} config={settings.config} canEdit={canEdit} /> : null}
      {/* What the receptionist is told, at rest: a title, who reads it, and the door to the sheet. Hookless. */}
      {window.BtPromptTold ? <window.BtPromptTold prompt={prompt} /> : null}
      {/* The sheets, LAST, after every card, through one slot (BtSheetSlot says why). Whatever card comes next goes above
          this line, and whatever sheet comes next goes through the slot; a page test holds it last. */}
      <BtSheetSlot prompt={prompt} brain={brain} canEdit={canEdit} flash={flash} saver={saver} />
    </>
  );
};

Object.assign(window, { BusinessTab, BtSheetSlot });
