// Chanlytics — Settings › Business, as a record.
//
// The tab was two surfaces that disagreed about what exists: a card showing nine facts, and a form editing about
// twenty-five behind one Save. Here every fact is a row, and a row is edited where it is stated
// (docs/superpowers/specs/2026-09-20-business-tab-design.md; the canvas's Record, Group-Who and Edit-Inline boards).
// This file draws the gap line and composes the cards. The page's two gestures, a row edited in its
// place (BtRow), a set of fields folded open under its row (BtFold) and a list in a sheet beside the page (BtSheet), are
// gestures/; each card is a module of its own (who.tsx, open.tsx, offer.tsx, answers.tsx, can.tsx), and the two
// sheets, the services list (services.tsx) and what the receptionist is told (prompt.tsx), are drawn here through ONE
// slot, after every card (BtSheetSlot says why).
//
// The page composes and never derives. Every sentence with a number or a judgement in it is contracts', through
// BUSINESS_TAB (legacy-bridge/business-tab.ts); every fact is the settings read's (settingsNow, factsNow), read as the
// page draws. What a save writes is save.tsx's, through the tab's saver (saver.ts): each row's check and patch, and the
// tab's one saver.
//
// Every component on the page that holds a hook is drawn on every render, and what comes and goes (a row at rest, a
// Confirm, a note) holds none: the tests' old stub React kept every hook on a page as a cell in one order, and this
// page was shaped to it. The stub now keeps each component's hooks where it sits, as React does, and throws as React
// does when a component's hooks change in number (tooling/scripts/tests/_hook-frames.mjs), so the shape stands as a
// habit and nothing new needs keeping to it.

import { useEffect, useRef, useState } from "react";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import { canDo, gateTitle } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { documentScroller, shownHeight } from "../../kit/motion/page-scroll";
import { recFolds } from "../../kit/record/registry";
import { BtAnswersCard } from "./answers";
import { BtCanCard } from "./can";
import { BtOfferCard } from "./offer";
import { BtOpenCard } from "./open";
import { BtPromptSheet, BtPromptTold, useBtPromptSheet } from "./prompt";
import type { BtPromptHold } from "./prompt";
import type { Brain, Config, Saver } from "./save";
import { businessTabSave } from "./saver";
import { BtServicesSheet } from "./services";
import { settingsNow } from "./shell";
import { BtWhoCard } from "./who";

/** The toast the shell raises (the page's `flash`). */
type Flash = (flash: LegacyFlash) => void;

/* ------------------------------------ the page ------------------------------------ */

/**
 * The page opens on its first card, as every other Settings pane does: the crumb names it, the rows say what it answers
 * from, the price rule's fold says what it does instead of a price, and Activity says who changed it. A title, a line
 * about both receptionists, a stamp and a sentence restating the rows stood above the cards until Ruben cut them as
 * clutter (26 Sep 2026).
 *
 * What stays is the one thing none of them says: the fact most worth adding, while one is missing (contracts'
 * businessGap), as the door to the row that adds it. Nothing is drawn while every fact is there. A role that may not
 * change the business reads the gap and gets no door, since the row behind it would not open.
 *
 * The door is named by its sentence and then by what it does, which is the act of the row it opens: "It cannot say
 * where you are. Add one Address", in the row's own words and label (RecordRow's ids), so a screen reader hears where
 * it goes and not only a statement. A row not on the page yet adds nothing to the name, and the sentence stands alone.
 */
const BtGap = ({ brain, door }: { brain: Brain; door: ((id: string) => void) | null }) => {
  // With how customers buy, which decides whether a missing booking link is a gap (the first run's decision 2).
  const gap = BUSINESS_TAB.businessGap(brain, businessTabSave.answer());
  if (!gap) return null;
  return (
    <p className="bt-gap" data-testid="rec-gap">
      <span className="bt-gap-dot" aria-hidden="true" />
      {door ? (
        <button
          type="button"
          className="bt-gap-door"
          onClick={() => door(gap.row)}
          aria-labelledby={`bt-gap-door-words rec-row-${gap.row}-act rec-row-${gap.row}-key`}
          data-testid="rec-gap-door"
        >
          <span id="bt-gap-door-words">{gap.sentence}</span>
        </button>
      ) : (
        <span className="bt-gap-words">{gap.sentence}</span>
      )}
    </p>
  );
};

/**
 * A door opens a row by its id, as the row's own act would open it: the registry holds each row's dirty test by id,
 * bound as the row's hook mounted (the kit's useRecordFold), so a row opened from here asks before its changes are
 * thrown away like any other, and one open elsewhere holding changes is asked about first. The services sheet is not a
 * fold, and opens the same way: it holds the registry under its id as a fold does (BtSheet), and is open while the
 * registry says so. The voice's gap opens How it answers' voice fold (answers.tsx) the same way.
 */
const btOpenRow = (id: string) => {
  recFolds.request(id);
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
 * A row's fold is a sheet as well (the kit's RecordFold), and it is NOT drawn here. The slot is for what is drawn
 * only while open; a fold holds the same hooks open or closed, as a sheet or under its row, so it is drawn where its row
 * is and moves no cell after it. Both can be on the page because only one can be open: the registry opens one editor
 * or sheet at a time, so a row's sheet and this slot's never stand on screen together (business-tab-page.test.mjs).
 */
export const BtSheetSlot = ({
  prompt,
  brain,
  canEdit,
  flash,
  saver,
}: {
  prompt: BtPromptHold | null;
  brain: Brain;
  canEdit: boolean;
  flash: Flash;
  saver: Saver;
}) => (
  <>
    <BtServicesSheet brain={brain} canEdit={canEdit} flash={flash} saver={saver} />
    {prompt && prompt.open ? <BtPromptSheet prompt={prompt} brain={brain} canEdit={canEdit} /> : null}
  </>
);

/**
 * What the page draws once, on every draw, before any card: the tab's saver drawing the page again as a save moves, the
 * workspace's own doors (the zone's and how customers buy's, which are the tab's for the same reason: save.tsx), and the
 * settings surface read again.
 */
const useBtPageSubscriptions = (saver: Saver) => {
  const [, setTick] = useState(0);
  // And the workspace's own doors, the zone's and how customers buy's, which are the tab's for the same reason
  // (save.tsx): one effect hears all three.
  // And the settings surface read again (after a save, a zone saved through its own route, a conflict's re-read, a
  // Retry), which is where every row's value comes from: heard here, not only by whatever draws the page, since a zone
  // saved and read back left the card's "in New York time" and the closures counted on New York's day until something
  // else drew the page.
  const zone = businessTabSave.zone;
  const buys = businessTabSave.sellsBy;
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const stops = [saver.subscribe(bump), zone ? zone.subscribe(bump) : null, buys ? buys.subscribe(bump) : null];
    window.addEventListener("surface:settings", bump);
    // The save's own rules come with this tab, never with the page (the bridge's loadSaveRules): drawn again when they
    // land, so a fold open by then says what they judge.
    let live = true;
    BUSINESS_TAB.loadSaveRules().then(
      () => {
        if (live) bump();
      },
      () => {},
    );
    return () => {
      live = false;
      stops.forEach((stop) => {
        if (stop) stop();
      });
      window.removeEventListener("surface:settings", bump);
    };
  }, [saver, zone, buys]);
};

/** Whether an element scrolls its own content up and down, by a person's hand. */
const btScrolls = (el: HTMLElement): boolean => {
  const y = getComputedStyle(el).overflowY;
  return (y === "auto" || y === "scroll") && el.scrollHeight > el.clientHeight;
};

/**
 * Bring a row to the middle of the pane that scrolls it, and move nothing else. Not `scrollIntoView`: that scrolls every
 * ancestor it can, the frame's own boxes among them, which are `overflow: hidden` and still move for a script. A page
 * arrives 4px low for 240ms (components.css route-in), so for that long the frame had 4px to scroll, and a door from
 * another page pushed the whole frame up by them (measured 9 October 2026, the Calendar's card to this row). A person
 * cannot scroll a hidden box back.
 */
const btRowIntoView = (key: HTMLElement): void => {
  let pane = key.parentElement;
  while (pane && !btScrolls(pane)) pane = pane.parentElement;
  const at = key.getBoundingClientRect();
  // No box scrolls it on a phone, where the window scrolls the pane (mobile.css, "The window scrolls"): the window
  // brings the row to the middle of the screen, and only where the page is longer than the screen.
  if (!pane) {
    const page = documentScroller();
    if (page.scrollHeight > page.clientHeight) window.scrollBy(0, at.top + at.height / 2 - shownHeight(page) / 2);
    return;
  }
  const box = pane.getBoundingClientRect();
  pane.scrollTop += at.top + at.height / 2 - (box.top + box.height / 2);
};

/**
 * A door on another page names the row it wants open (`admin/workspace/<row>`: settings/frame/tabs.ts settingsRowOf):
 * the Calendar's "Check the link", Setup's and Connections' row, Ask's "Connect a calendar". Once per arrival, when the
 * rows are drawn: the row is brought into view, since it may be a screen down, and opened as its own act would open it
 * (btOpenRow), for a role that may change it. A row the page does not draw opens nothing, and the page is where it
 * landed.
 */
const useBtOpenRow = (row: string | null, drawn: boolean, canEdit: boolean) => {
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!row || !drawn || opened.current === row) return;
    const key = document.getElementById(`rec-row-${row}-key`);
    if (!key) return;
    opened.current = row;
    btRowIntoView(key);
    if (canEdit) btOpenRow(row);
  }, [row, drawn, canEdit]);
};

/**
 * Settings › Business, drawn from the settings read. A workspace with no brain -- none set up, or a config the parser
 * refused -- is PaneWorkspace's to draw, so the page draws nothing it cannot back.
 */
export const BusinessTab = ({ flash = () => {}, open = null }: { flash?: Flash; open?: string | null }) => {
  // The tab's one saver (save.tsx), which outlives the page: a page drawn again on coming back to this tab
  // finds the save still out and the answer to the last one. A save moving through it draws the page again, busy or
  // done, for as long as the page is on screen.
  const saver = businessTabSave.saver;
  useBtPageSubscriptions(saver);
  // What the receptionist is told: the prompt sheet's hold on the registry and the channel it shows (prompt.tsx),
  // held here, on every draw and before every card, so the told section at rest says the channel last chosen and the
  // sheet itself is the one thing that comes and goes, in the slot (BtSheetSlot).
  const prompt = useBtPromptSheet();
  const settings = settingsNow() || null;
  const config = settings && (settings.config as Config | null);
  const brain = (config && config.brain) || null;
  const canEdit = canDo("settings");
  useBtOpenRow(open, !!(settings && config && brain), canEdit);
  if (!settings || !config || !brain) return null;
  // The config the next save goes on: what every row's "It will say" is worked out on.
  const base = saver.base();
  return (
    <>
      {/* A role that may not change the business reads all of it. Each row's act is absent rather than a dead button,
          so the page says why once, here. */}
      {canEdit ? null : (
        <p className="bt-viewer" data-testid="bt-viewer">
          <Icon name="shield" size={11} /> {gateTitle("settings", "change the business")} You can read everything.
        </p>
      )}
      <BtGap brain={brain} door={canEdit ? btOpenRow : null} />
      {/* Each card is a module of its own (who.tsx, open.tsx, offer.tsx, answers.tsx, can.tsx). */}
      <BtWhoCard brain={brain} base={base} canEdit={canEdit} flash={flash} saver={saver} />
      <BtOpenCard
        brain={brain}
        config={config}
        prompt={settings.prompt || null}
        canEdit={canEdit}
        flash={flash}
        saver={saver}
      />
      <BtOfferCard brain={brain} canEdit={canEdit} flash={flash} saver={saver} />
      <BtAnswersCard brain={brain} base={base} config={config} canEdit={canEdit} flash={flash} saver={saver} />
      <BtCanCard brain={brain} config={config} canEdit={canEdit} />
      {/* What the receptionist is told, at rest: a title, who reads it, and the door to the sheet. Hookless. */}
      <BtPromptTold prompt={prompt} />
      {/* The sheets, LAST, after every card, through one slot (BtSheetSlot says why). Whatever card comes next goes above
          this line, and whatever sheet comes next goes through the slot; a page test holds it last. */}
      <BtSheetSlot prompt={prompt} brain={brain} canEdit={canEdit} flash={flash} saver={saver} />
    </>
  );
};
