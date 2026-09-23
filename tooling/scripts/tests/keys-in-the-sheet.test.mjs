/**
 * The keys are listed in one place, the ? sheet, and drawn nowhere else. Ruben, 23 Sep 2026: "remove all display of
 * these keyboard symbols throughout the site while keeping functionality we built ... we already have the keyboard
 * shortcuts on the user nav sidebar that is enough."
 *
 * Here the shell's own chrome, EXECUTED on the stub React with the shell's real words (legacy-bridge/shell.ts
 * installShell): the sidebar's rail button, its two menus, and the sheet, which the account menu opens. Each page's
 * keys are held in the page's own test, where its keys are pressed: the top bar's Ask button (shell-status), the
 * People table's foot and search (people-honest), Leads' search and Find leads (leads-honest), the lead finder
 * (leads-finder), the Calendar's steps and legend (calendar-honest), the Inbox's Send and approval card
 * (inbox-status) and the record kit's inline editor (record-kit). What counts as drawing a key is `_keys.mjs`'s.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHORTCUTS } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, all, find, byTestId, textOf, press } from "./_legacy-react.mjs";
import { importSrc } from "./_source.mjs";
import { keysDrawn } from "./_keys.mjs";

installLegacyReact({
  __DEMO_MODE: false,
  usePPToast: () => [null, () => {}],
  __WORKSPACES: [
    { id: "w1", name: "Studio One" },
    { id: "w2", name: "Studio Two" },
  ],
  __ACTIVE_WORKSPACE: "w1",
});
const W = globalThis.window;
const { installShell } = await importSrc("apps/dashboard/src/legacy-bridge/shell.ts");
installShell(W);
await import("../../../apps/dashboard/src/legacy/components/sidebar.jsx");
await import("../../../apps/dashboard/src/legacy/components/shortcuts.jsx");

/** The sidebar and the sheet, as the shell draws them (app-shell.jsx). */
const shell = (props = {}) =>
  W.React.createElement(
    "Fragment",
    null,
    W.React.createElement(W.Sidebar, { onNavigate() {}, ...props }),
    W.React.createElement(W.ShortcutsSheet, {}),
  );
/** A new shell: every cell and listener forgotten, then drawn. */
const draw = (props) => {
  fresh();
  return shell(props);
};
/** The same shell again, over its cells, as React draws it after a state change. */
const redraw = (props) => again(() => shell(props));

test("REGRESSION: the rail button says Collapse, and its tip on the rail says Expand the sidebar -- ⌘B stood beside both", () => {
  let tree = draw();
  assert.equal(textOf(byTestId(tree, "sb-collapse")), "Collapse");
  assert.deepEqual(keysDrawn(tree), [], "the sidebar, open, draws no key");
  tree = draw({ collapsed: true });
  assert.equal(byTestId(tree, "sb-collapse").props["data-tip"], "Expand the sidebar");
  assert.equal(byTestId(tree, "sb-collapse").props["aria-label"], "Expand the sidebar");
  assert.deepEqual(keysDrawn(tree), [], "nor as a rail");
});

test("REGRESSION: the account menu's Keyboard shortcuts says only that, and still opens the sheet -- a ? stood beside it", () => {
  let tree = draw();
  press(byTestId(tree, "sb-account"));
  tree = redraw();
  const menu = byTestId(tree, "sb-account-menu");
  assert.ok(menu, "the menu is open");
  assert.equal(textOf(byTestId(menu, "sb-me-shortcuts")), "Keyboard shortcuts");
  assert.deepEqual(keysDrawn(menu), []);
  press(byTestId(menu, "sb-me-shortcuts"));
  tree = redraw();
  assert.equal(byTestId(tree, "sb-account-menu"), null, "the menu closes");
  assert.ok(byTestId(tree, "shortcuts-sheet"), "and the sheet opens");
});

test("REGRESSION: the workspace menu names the workspaces and the one being viewed, with no ⌘1 or ⌘2 beside them", () => {
  let tree = draw();
  press(find(tree, (n) => n.type === "button" && n.props?.className === "sb-team"));
  tree = redraw();
  const menu = byTestId(tree, "sb-workspace-menu");
  assert.ok(menu, "the menu is open");
  const items = all(menu, (n) => n.props?.["data-testid"] === "sb-ws-item");
  assert.deepEqual(
    items.map((n) => [textOf(n), n.props["aria-checked"]]),
    [
      ["SOStudio One", true],
      ["STStudio Two", false],
    ],
    "each workspace's mark and name, the one being viewed checked",
  );
  assert.deepEqual(keysDrawn(menu), []);
});

test("the sheet is the one place a key is drawn: every key the app answers to, the Calendar's among them", () => {
  let tree = draw();
  W.dispatchEvent(new CustomEvent("shortcuts:open"));
  tree = redraw();
  const sheet = byTestId(tree, "shortcuts-sheet");
  assert.ok(sheet, "open");
  assert.deepEqual(
    all(sheet, (n) => n.type === "kbd").map(textOf),
    SHORTCUTS.flatMap((s) => s.keys),
    "a key for every key of every shortcut, in the sheet's order",
  );
  assert.ok(
    all(sheet, (n) => n.props?.className === "sb-sheet-group")
      .map(textOf)
      .includes("Calendar"),
    "the Calendar's keys were said only in its legend and its buttons' tips",
  );
  const outside = draw();
  assert.equal(byTestId(outside, "shortcuts-sheet"), null, "closed until asked");
  assert.deepEqual(keysDrawn(outside), [], "and with it closed, the shell draws no key");
});
