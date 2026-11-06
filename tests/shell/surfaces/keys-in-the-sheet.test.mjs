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
import { installLegacyReact, fresh, again, all, byTestId, textOf, press } from "../../_legacy-react.mjs";
import { importSrc } from "../../_source.mjs";
import { keysDrawn } from "../../_keys.mjs";

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
// The sidebar (surfaces/frame/sidebar/sidebar.tsx), under the name the frame draws it by.
W.Sidebar = (await importSrc("apps/dashboard/src/surfaces/frame/sidebar/sidebar.tsx")).Sidebar;
// The shortcuts sheet (surfaces/frame/shortcuts.tsx), under the names the frame draws and calls it by.
const shortcutsSheet = await importSrc("apps/dashboard/src/surfaces/frame/shortcuts.tsx");
Object.assign(W, { ShortcutsSheet: shortcutsSheet.ShortcutsSheet, openShortcuts: shortcutsSheet.openShortcuts });

/** The sidebar and the sheet, as the shell draws them (surfaces/frame/shell-chrome.tsx). */
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

/** The viewport as a desk (the sidebar stands beside the page) or a phone (it is a drawer), for the menu's doors. */
const onDesk = (desk, run) => {
  const was = W.matchMedia;
  W.matchMedia = (q) => ({
    matches: desk && q === "(min-width: 901px)",
    addEventListener() {},
    removeEventListener() {},
  });
  try {
    run();
  } finally {
    W.matchMedia = was;
  }
};

test("the account menu draws no key: Settings, Profile and Notifications on any screen, and on a desk the Keyboard shortcuts row, a pointer's door to the sheet", () => {
  // The row left the menu on 7 Oct 2026 (the sheet opens on ?) and a person who does not know to press ? could not find the list;
  // a phone needs no keys. The row's words name none (Ruben, 23 Sep 2026), and the sheet is the one place a key is drawn.
  onDesk(false, () => {
    let tree = draw();
    press(byTestId(tree, "sb-account"));
    tree = redraw();
    const menu = byTestId(tree, "sb-account-menu");
    assert.ok(menu, "the menu is open");
    assert.equal(byTestId(menu, "sb-me-shortcuts"), null, "a phone needs no keys");
    assert.deepEqual(keysDrawn(menu), []);
    assert.equal(textOf(byTestId(menu, "sb-me-settings")), "Settings");
    assert.match(textOf(byTestId(menu, "sb-me-name")), /^Profile/);
    assert.equal(textOf(byTestId(menu, "sb-me-notifications")), "Notifications");
  });
  onDesk(true, () => {
    let tree = draw();
    press(byTestId(tree, "sb-account"));
    tree = redraw();
    const menu = byTestId(tree, "sb-account-menu");
    const row = byTestId(menu, "sb-me-shortcuts");
    assert.ok(row, "on a desk the menu holds the row");
    assert.equal(textOf(row), "Keyboard shortcuts");
    assert.deepEqual(keysDrawn(menu), [], "its words name no key");
    assert.equal(textOf(byTestId(menu, "sb-me-settings")), "Settings", "beside the doors it always had");
    assert.equal(byTestId(tree, "shortcuts-sheet"), null, "closed until asked");
    press(row);
    tree = redraw();
    assert.ok(byTestId(tree, "shortcuts-sheet"), "the press opens the sheet");
    assert.equal(byTestId(tree, "sb-account-menu"), null, "and the menu lets go");
  });
});

test("REGRESSION: the workspace menu names the workspaces and the one being viewed, with no ⌘1 or ⌘2 beside them", () => {
  let tree = draw();
  press(byTestId(tree, "sb-workspace"));
  tree = redraw();
  const menu = byTestId(tree, "sb-workspace-menu");
  assert.ok(menu, "the menu is open");
  const items = all(menu, (n) => n.props?.["data-testid"] === "sb-ws-item");
  assert.deepEqual(
    items.map((n) => n.props["aria-checked"]),
    [true, false],
    "the one being viewed checked",
  );
  assert.ok(textOf(items[0]).includes("Studio One") && textOf(items[1]).includes("Studio Two"), "each by its name");
  assert.deepEqual(keysDrawn(menu), []);
});

test("the sheet opens on ? and by the opener it registers, never by an event, and Esc closes it", () => {
  draw();
  W.dispatchEvent(new CustomEvent("shortcuts:open"));
  assert.equal(byTestId(redraw(), "shortcuts-sheet"), null, "nothing sends or hears shortcuts:open any more");
  const key = (k) => W.dispatchEvent({ type: "keydown", key: k, target: null, preventDefault() {} });
  key("?");
  assert.ok(byTestId(redraw(), "shortcuts-sheet"), "? opens it");
  key("Escape");
  assert.equal(byTestId(redraw(), "shortcuts-sheet"), null, "and Esc closes it");
  W.openShortcuts();
  assert.ok(byTestId(redraw(), "shortcuts-sheet"), "openShortcuts() opens it");
});

test("the sheet is the one place a key is drawn: every key the app answers to, the Calendar's among them", () => {
  draw();
  W.openShortcuts();
  const tree = redraw();
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
