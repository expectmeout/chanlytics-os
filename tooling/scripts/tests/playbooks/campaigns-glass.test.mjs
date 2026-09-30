/**
 * Campaigns under Glass (the interface kit's step 5.4, the Campaigns canvas C1 and C2): the markup only Glass draws is
 * drawn by the look and by nothing else. The page opens on the surface's title, the composers stand as rows (the word at the
 * left, the Classic section at the right), and Classic, the look members see, draws none of it: no row, no visible title, and
 * the sentence under the composer's name that Glass drops. Drawn on the stub React, over the look the document says.
 *
 * What a look changes by token is not here (the gallery and the harness's shots show it); this holds the few pieces of
 * markup a look draws that another does not, and that each section keeps the testids Classic's tests and specs reach it by.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as contracts from "@chanlytics/contracts";
import {
  installLegacyReact,
  fresh as freshTree,
  again,
  all,
  find,
  byTestId,
  press,
  textOf,
} from "../_legacy-react.mjs";

const TID = "t-studio";
const ZONE = "America/New_York";
const NOW = new Date("2026-09-28T18:00:00.000Z");

installLegacyReact({
  location: {
    pathname: "/w/studio",
    hash: "#/outbound",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __WORKSPACES: [{ id: TID, slug: "studio", name: "Northside Studio", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: TID,
  __DEMO_MODE: false,
  setInterval: () => 1,
  clearInterval() {},
});
const SRC = "../../../../apps/dashboard/src";
const { installClock } = await import(`${SRC}/legacy-bridge/zone.ts`);
installClock();
// The shell's own components the pages draw by name (PolicyChip, Confirm, the record kit's sheet): the frame's JSX.
await import(`${SRC}/legacy/components/data-bits.jsx`);
await import(`${SRC}/legacy/components/record-fold.jsx`);
Object.assign(globalThis, {
  usePPToast: () => [null, () => {}],
  CHANLY: { nav() {}, R: { admin: (pane) => `admin/${pane}` } },
  appNavigate() {},
  __chrome: { state: contracts.stateOf },
  __ME: { role: "owner" },
  canDo: () => true,
  gate: () => ({}),
  gateTitle: (perm, doing) => `Only an owner or operator can ${doing}.`,
});
await import(`${SRC}/legacy/components/record-sheet.jsx`);
const { PlaybooksPage } = await import(`${SRC}/surfaces/campaigns/playbooks/playbooks-page.tsx`);
const { BroadcastsPage } = await import(`${SRC}/surfaces/campaigns/broadcasts/broadcasts-page.tsx`);
const { playbooksSample } = await import(`${SRC}/surfaces/campaigns/playbooks/sample.ts`);
const { broadcastsSample } = await import(`${SRC}/surfaces/campaigns/broadcasts/sample.ts`);
const { setSurfaceValue } = await import(`${SRC}/surfaces/surface-values.ts`);
const { currentLook } = await import(`${SRC}/surfaces/look.ts`);

/** The document's root, as the head's script and the shell stamp it: Glass where it says so, and nothing else says Classic. */
const lookIs = (look) => {
  globalThis.document.documentElement = { getAttribute: (name) => (name === "data-look" && look ? look : null) };
};
const allByTestId = (tree, id) => all(tree, (n) => n.props?.["data-testid"] === id);
const within = (tree, id, inner) => {
  const outer = byTestId(tree, id);
  return !!outer && !!find(outer, (n) => n.props?.["data-testid"] === inner);
};
const wordOf = (row) => textOf(find(row, (n) => String(n.props?.className || "").includes("-grow-word")));

/** The playbooks page with its composer open on a moment's Set it up. */
const composing = (look) => {
  lookIs(look);
  setSurfaceValue("playbooks", playbooksSample(NOW));
  freshTree();
  const page = () => again(() => PlaybooksPage({}));
  const tree = page();
  press(
    find(
      find(tree, (n) => n.props?.["data-testid"] === "pb-slot"),
      (n) => n.props?.["data-testid"] === "pb-slot-start",
    ),
  );
  return page();
};

test("the look is Glass only where the document says it is", () => {
  lookIs(null);
  assert.equal(currentLook(), "classic", "no look stamped: Classic");
  lookIs("classic");
  assert.equal(currentLook(), "classic");
  lookIs("glass");
  assert.equal(currentLook(), "glass");
  const root = globalThis.document.documentElement;
  delete globalThis.document.documentElement;
  assert.equal(currentLook(), "classic", "no document to ask (a server render): Classic");
  globalThis.document.documentElement = root;
  lookIs("anything else");
  assert.equal(currentLook(), "classic", "a word that is not a look is not Glass");
});

test("the head: Glass opens a tab's list on the surface's title, Classic keeps the tab's name for a screen reader", () => {
  lookIs(null);
  setSurfaceValue("playbooks", playbooksSample(NOW));
  freshTree();
  let title = find(
    again(() => PlaybooksPage({})),
    (n) => n.type === "h1",
  );
  assert.equal(textOf(title), "Playbooks");
  assert.ok(String(title.props.className).includes("cm-sr"), "Classic: the name is a screen reader's alone");
  lookIs("glass");
  title = find(
    again(() => PlaybooksPage({})),
    (n) => n.type === "h1",
  );
  assert.equal(textOf(title), "Campaigns", "Glass: the surface's name, which the strip above narrows to this tab");
  assert.ok(!String(title.props.className).includes("cm-sr"), "and seen");
});

test("the playbook composer: Classic's sections as they were; Glass's four rows, each holding Classic's section", () => {
  const classic = composing(null);
  for (const id of ["pb-who", "pb-message", "pb-clock"]) assert.ok(byTestId(classic, id), `Classic: ${id}`);
  for (const id of ["pb-row-to", "pb-row-says", "pb-row-when", "pb-row-under"])
    assert.equal(byTestId(classic, id), null, `Classic draws no row (${id})`);
  assert.ok(textOf(classic).includes("One approved message"), "Classic says what a playbook is under its name");

  const glass = composing("glass");
  const rows = ["pb-row-to", "pb-row-says", "pb-row-when", "pb-row-under"].map((id) => byTestId(glass, id));
  assert.ok(
    rows.every((r) => r),
    "Glass: the four rows",
  );
  assert.deepEqual(rows.map(wordOf), ["To", "Says", "When", "Under"]);
  assert.ok(within(glass, "pb-row-to", "pb-who"), "To holds who it is for");
  assert.ok(within(glass, "pb-row-says", "pb-message"), "Says holds the message");
  assert.ok(within(glass, "pb-row-when", "pb-clock"), "When holds the sentence of its numbers");
  assert.ok(within(glass, "pb-row-under", "pb-guard"), "Under holds the guardrails");
  assert.ok(
    within(glass, "pb-row-under", "pb-runs-under") || byTestId(glass, "pb-runs-under") === null,
    "and the row it runs under",
  );
  assert.equal(allByTestId(glass, "pb-hour").length, 1, "the hour is chosen where it was, once");
  assert.ok(!textOf(glass).includes("One approved message"), "Glass: the explanation under the title is gone");
  for (const id of ["pb-save", "pb-cancel"]) assert.ok(byTestId(glass, id), `the foot keeps ${id}`);
});

test("the broadcast composer: Classic's three columns; Glass's rows To, Says, When in one pane", () => {
  const open = (look) => {
    lookIs(look);
    setSurfaceValue("broadcasts", broadcastsSample(NOW));
    freshTree();
    const page = () => again(() => BroadcastsPage({}));
    press(byTestId(page(), "bc-new"));
    return page();
  };
  const classic = open(null);
  assert.ok(byTestId(classic, "bc-composer"));
  assert.ok(
    find(classic, (n) => String(n.props?.className || "") === "bc-cols"),
    "Classic: the columns",
  );
  assert.equal(
    find(classic, (n) => String(n.props?.className || "") === "bc-grow"),
    null,
    "Classic draws no row",
  );
  const glass = open("glass");
  const rows = all(glass, (n) => String(n.props?.className || "") === "bc-grow");
  assert.deepEqual(rows.map(wordOf), ["To", "Says", "When"]);
  assert.ok(within(glass, "bc-composer", "bc-col-who") && within(glass, "bc-composer", "bc-col-what"));
  assert.ok(within(glass, "bc-composer", "bc-col-when"), "each column keeps its testid");
  assert.ok(String(byTestId(glass, "bc-composer").props.className).includes("bc-glass"));
  assert.ok(byTestId(glass, "bc-send") && byTestId(glass, "bc-compose-close"), "the foot and Cancel are the same");
});
