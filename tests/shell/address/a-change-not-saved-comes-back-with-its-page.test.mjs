/**
 * A change typed into a fold and not saved is kept in the tab, and comes back with its page: the fold opens again on what
 * was typed, where the person left it, with Save and Cancel beside it.
 *
 * Since 13 Nov 2026 every way off a page asks "Leave without saving?" while a fold holds a change (#2312), but the browser
 * lets a page stop only some of them: a second Back with nothing pressed between, and every Back in a browser without the
 * Navigation API (Safari before 26.2, Firefox before 147), went without a word, and the Website typed into Settings ›
 * Details went with them. Kept in the tab as a composer's words are (kit/record/work.tsx), the change is never lost that
 * way, and the question is a courtesy rather than the only thing between a person and their typing.
 *
 * What drops it is the person's own answer: Save taken, Cancel, "Discard" when another fold is asked for, and "Yes,
 * leave". Nothing typed is nothing kept, and the tab forgets it at sign-out with the rest of its memory.
 *
 * EXECUTED: the record kit's hook on the stub React, and Settings › Details as the Business tab's own tests draw it
 * (_business-tab-harness.mjs), over the tab's real memory (bridge/tab-memory.ts) on the stub window's sessionStorage.
 * A page left is the page unmounted, as React takes it away when the person goes elsewhere; one come back is drawn new.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { unmount, again, byTestId, press, textOf } from "../../_stub-react.mjs";
import { until } from "../../shared/_until.mjs";
import {
  W,
  drawTab,
  redrawTab,
  openFold,
  openRows,
  openFolds,
  boxOf,
  typeInto,
  saveRow,
  cancelRow,
  saving,
  marisa,
  labelled,
  typeAt,
  saveFoldOf,
  cancelFoldOf,
} from "../../_business-tab-harness.mjs";

after(() => unmount());

// The same modules the pages require (the stub React's note says why a second import would be a second registry).
const fromDashboard = createRequire(new URL("../../../apps/dashboard/src/bridge/_.js", import.meta.url));
const { holdMove, answerLeave } = fromDashboard("../surfaces/kit/record/held-move.ts");
const { installTabMemory, clearTabMemory } = fromDashboard("./tab-memory.ts");
installTabMemory(W);
const folds = W.__recordFolds;

/**
 * The person goes elsewhere: the page is taken away, and the registry lets go of the page's own folds (`mine`) a moment
 * later. A fold the page never drew (one another fold's Discard opened) is not the page's to let go.
 */
const leave = async (mine = ["website", "hours"]) => {
  unmount();
  await until(() => !mine.includes(folds.open()), "the page gone, the registry lets its folds go");
};

/* ------------------------------------ the kit: a fold's hook, given what to keep ------------------------------------ */

/**
 * A page with one fold, "notes", that keeps its change: its draft is `page.draft` (null until typed), what is stored is
 * `page.stored`, and the hook is handed what to keep and how to put it back.
 */
const notesPage = () => {
  const page = { draft: null, stored: "Open late on Thursdays", fold: null, restored: [] };
  const Page = () => {
    page.fold = W.useRecordFold("notes", {
      dirty: () => page.draft != null && page.draft !== page.stored,
      keep: {
        value: page.draft,
        restore: (kept) => {
          page.restored.push(kept);
          page.draft = kept;
        },
      },
    });
    // Counted on the page as a drawn fold is (RecordFold's `drawn`), so the registry lets it go as the page goes.
    W.React.useEffect(() => folds.drawn("notes"), []);
    return null;
  };
  page.draw = () => {
    unmount();
    folds.reset();
    return W.React.createElement(Page);
  };
  page.redraw = () => again(() => W.React.createElement(Page));
  return page;
};

test("a change typed into a fold is kept in the tab, and its page come back opens the fold on it", async () => {
  clearTabMemory(W.sessionStorage);
  const page = notesPage();
  page.draw();
  page.fold.request();
  page.redraw();
  page.draft = "Open late on Thursdays and Fridays";
  page.redraw();
  await leave(["notes"]);
  assert.equal(folds.open(), null, "the page gone, nothing is open");

  page.draft = null;
  page.draw();
  page.redraw();
  page.redraw();
  assert.equal(page.fold.open, true, "REGRESSION: come back, the fold was shut and what was typed was gone");
  assert.deepEqual(page.restored, ["Open late on Thursdays and Fridays"], "it opens on what was typed");
  assert.equal(folds.foldDirty(), true, "and it is a change not saved again: a move off the page asks about it");
  folds.reset();
});

test("nothing typed is nothing kept, nor a change typed and put back as it was", async () => {
  clearTabMemory(W.sessionStorage);
  const page = notesPage();
  page.draw();
  page.fold.request();
  page.redraw();
  await leave(["notes"]);
  page.draw();
  page.redraw();
  page.redraw();
  assert.deepEqual([page.fold.open, page.restored], [false, []], "opened and left untouched: it does not come back");

  page.fold.request();
  page.redraw();
  page.draft = "Open late on Fridays";
  page.redraw();
  page.draft = page.stored;
  page.redraw();
  await leave(["notes"]);
  page.draft = null;
  page.draw();
  page.redraw();
  page.redraw();
  assert.deepEqual([page.fold.open, page.restored], [false, []], "typed and put back: nothing to keep");
});

test("Save taken and Cancel drop what was kept: the fold closed by the person stays closed", async () => {
  for (const how of ["saved", "cancelled"]) {
    clearTabMemory(W.sessionStorage);
    const page = notesPage();
    page.draw();
    page.fold.request();
    page.redraw();
    page.draft = "Closed on Mondays";
    page.redraw();
    // Both close the fold the same way: the save's answer taken, or Cancel (with its question answered).
    if (how === "saved") page.stored = page.draft;
    page.draft = null;
    page.fold.close();
    page.redraw();
    await leave(["notes"]);
    page.draw();
    page.redraw();
    page.redraw();
    assert.deepEqual([page.fold.open, page.restored], [false, []], `${how}: nothing comes back`);
  }
});

test("a save taken after its page was left still drops what was kept", async () => {
  // A second Back with the save out: the page goes, the tab's saver keeps the save, and its answer closes the fold.
  clearTabMemory(W.sessionStorage);
  const page = notesPage();
  page.draw();
  page.fold.request();
  page.redraw();
  page.draft = "Closed on Sundays";
  page.redraw();
  const close = page.fold.close;
  await leave(["notes"]);
  close();
  page.draft = null;
  page.draw();
  page.redraw();
  page.redraw();
  assert.deepEqual([page.fold.open, page.restored], [false, []]);
});

test("Discard, when another fold is asked for, and Yes, leave drop it; Stay keeps it", async () => {
  clearTabMemory(W.sessionStorage);
  const page = notesPage();
  page.draw();
  page.fold.request();
  page.redraw();
  page.draft = "Walk-ins until 4";
  page.redraw();
  folds.request("hours");
  page.redraw();
  assert.deepEqual(page.fold.asking, { holding: "notes", wants: "hours" });
  page.fold.discard();
  await leave(["notes"]);
  page.draft = null;
  page.draw();
  page.redraw();
  page.redraw();
  assert.deepEqual([page.fold.open, page.restored], [false, []], "Discard: nothing comes back");

  page.fold.request();
  page.redraw();
  page.draft = "Walk-ins until 5";
  page.redraw();
  let went = 0;
  assert.equal(
    holdMove(() => (went += 1)),
    true,
    "a move off the page is held, and asks",
  );
  answerLeave(false);
  assert.equal(went, 0, "Stay");
  assert.equal(
    holdMove(() => (went += 1)),
    true,
  );
  answerLeave(true);
  assert.equal(went, 1, "Yes, leave: the move is made");
  await leave(["notes"]);
  page.draft = null;
  page.draw();
  page.redraw();
  page.redraw();
  assert.deepEqual([page.fold.open, page.restored], [false, []], "Yes, leave: the change was thrown away, as said");
});

test("a kept change is the workspace's own, and goes at sign-out with the rest of the tab's memory", async () => {
  clearTabMemory(W.sessionStorage);
  const page = notesPage();
  page.draw();
  page.fold.request();
  page.redraw();
  page.draft = "By appointment only";
  page.redraw();
  await leave(["notes"]);

  const here = W.location.pathname;
  W.location.pathname = "/w/another-salon/settings/workspace";
  try {
    page.draft = null;
    page.draw();
    page.redraw();
    page.redraw();
    assert.deepEqual([page.fold.open, page.restored], [false, []], "another workspace never opens on it");
  } finally {
    W.location.pathname = here;
  }
  await leave(["notes"]);

  clearTabMemory(W.sessionStorage);
  page.draw();
  page.redraw();
  page.redraw();
  assert.deepEqual([page.fold.open, page.restored], [false, []], "signed out: nothing comes back");
});

/* ------------------------------------ Settings › Details: the Website row, and the hours fold ------------------------------------ */

test("a Website typed in Settings › Details and left comes back in its box, open, and Save sends it", async () => {
  clearTabMemory(W.sessionStorage);
  const sent = saving();
  let tree = drawTab();
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "marisas.example.com");
  redrawTab();
  await leave();

  drawTab();
  redrawTab();
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["website"], "REGRESSION: the row was at rest, saying the Website it had before");
  assert.equal(boxOf(tree, "website").props.value, "marisas.example.com", "what was typed is in the box");
  assert.equal(W.__settingsUnsaved(), true, "and it is still a change not saved");

  saveRow(tree, "website");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].config.brain.profile.website, "https://marisas.example.com");
  await leave();
  drawTab();
  redrawTab();
  tree = redrawTab();
  assert.deepEqual(openRows(tree), [], "saved: the page comes back at rest");
});

test("a page that learns only after it is drawn that the person may change it opens the kept Website once it does", async () => {
  // A first load: the role is read after the page is drawn, and until then no row has an editor (canDo is false).
  clearTabMemory(W.sessionStorage);
  saving();
  let tree = drawTab();
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "marisas.example.com");
  redrawTab();
  await leave();

  const may = W.canDo;
  W.canDo = () => false;
  try {
    drawTab();
    redrawTab();
    tree = redrawTab();
    assert.deepEqual(openRows(tree), [], "no editor for a role not known yet");
    redrawTab();
  } finally {
    W.canDo = may;
  }
  tree = redrawTab();
  assert.deepEqual(openRows(tree), ["website"], "the role read: the row opens");
  assert.equal(boxOf(tree, "website").props.value, "marisas.example.com", "on what was typed");
});

test("a Website typed and cancelled, or thrown away by Yes, leave, does not come back; nothing typed, nothing opens", async () => {
  clearTabMemory(W.sessionStorage);
  saving();
  let tree = drawTab();
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "marisas.example.com");
  tree = redrawTab();
  cancelRow(tree, "website");
  redrawTab();
  await leave();
  drawTab();
  redrawTab();
  assert.deepEqual(openRows(redrawTab()), [], "cancelled");

  tree = redrawTab();
  openFold(tree, "website");
  tree = redrawTab();
  typeInto(tree, "website", "marisas.example.com");
  redrawTab();
  assert.equal(
    holdMove(() => {}),
    true,
  );
  answerLeave(true);
  await leave();
  drawTab();
  redrawTab();
  assert.deepEqual(openRows(redrawTab()), [], "Yes, leave");

  tree = redrawTab();
  openFold(tree, "website");
  redrawTab();
  await leave();
  drawTab();
  redrawTab();
  assert.deepEqual(openRows(redrawTab()), [], "opened, nothing typed");
});

test("the hours typed and left come back as typed; a colleague's change read back meanwhile is not put back by its Save", async () => {
  clearTabMemory(W.sessionStorage);
  const sent = saving();
  const flashes = [];
  const flash = (f) => flashes.push(f);
  let tree = drawTab({ flash });
  openFold(tree, "hours");
  tree = redrawTab(flash);
  typeAt(tree, "Monday closes", "17:00");
  redrawTab(flash);
  await leave();

  // While the page was away, a colleague closed Tuesday at 20:00, and the settings read brought it into this tab.
  drawTab({ flash, profile: { ...marisa, hours: { ...marisa.hours, tue: { open: "09:30", close: "20:00" } } } });
  redrawTab(flash);
  tree = redrawTab(flash);
  assert.deepEqual(openFolds(tree), ["hours"], "the hours fold opens again");
  assert.equal(labelled(tree, "Monday closes").props.value, "17:00", "on what was typed");
  saveFoldOf(tree, "hours");
  tree = redrawTab(flash);
  assert.equal(sent.length, 0, "the week typed over is not sent over their Tuesday");
  assert.match(textOf({ props: { children: flashes.at(-1)?.msg } }), /changed after you opened it/);
  assert.deepEqual(openFolds(tree), ["hours"], "the fold stays open with the change");

  cancelFoldOf(tree, "hours");
  press(byTestId(redrawTab(flash), "rec-fold-hours-cancel-yes"));
  redrawTab(flash);
  await leave();
  drawTab({ flash });
  redrawTab(flash);
  assert.deepEqual(openFolds(redrawTab(flash)), [], "cancelled: it does not come back");
});
