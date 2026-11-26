/**
 * Every address of the business lands on its pane: Details keeps the route id `workspace`, and the addresses the
 * business's page answered before it was four tabs (hours, receptionist, outreach) still draw it, each opened on its
 * part, so a bookmark, an Ask answer and a bell's link written before the split all land. Memory, since it became
 * content (decision 0070), is a pane of its own. Drawn on the Settings page, not read from its text (25 Nov 2026).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSOLE_PATH } from "@chanlytics/contracts";
import { all, draw, settings, textOf } from "./_settings-owner-panes.mjs";
import { bridgeHolds } from "../../shell/_bridge-holds.mjs";

const { PaneWorkspace } = await import("../../../apps/dashboard/src/surfaces/settings/frame/workspace.tsx");
const { PaneMemory } = await import("../../../apps/dashboard/src/surfaces/settings/memory/pane.tsx");
const { PaneBillingReal } = await import("../../../apps/dashboard/src/surfaces/settings/billing/pane.tsx");

/** The panes the page drew for `tab`, by the component each is. */
const panesOf = (tab) => all(settings(tab), (n) => n.type === PaneWorkspace || n.type === PaneMemory);

test("every address of the business lands on its pane, opened on its part, and Memory is a pane of its own", () => {
  for (const tab of ["workspace", "hours", "receptionist", "outreach"]) {
    const drawn = panesOf(tab);
    assert.equal(drawn.length, 1, `${tab}: one pane`);
    assert.equal(drawn[0].type, PaneWorkspace, `${tab}: the business's`);
    assert.equal(drawn[0].props.part, tab, `${tab}: opened on its part`);
  }
  const memory = panesOf("memory");
  assert.deepEqual(
    memory.map((n) => n.type),
    [PaneMemory],
    "Memory draws its own pane, not the business's",
  );
  assert.deepEqual(panesOf("team"), [], "and a tab of the people draws neither");
});

test("Billing and Memory are real panes, and neither says it is not built", () => {
  // The mockup's twin of Memory (five invented memories with a Forget that kept nothing) went with step 11 of decision
  // 0015, and the honest "not built yet" in its place when the memory was built; Billing is the workspace's own.
  const billing = settings("billing");
  assert.equal(all(billing, (n) => n.type === PaneBillingReal).length, 1, "Billing draws the real pane");
  assert.doesNotMatch(textOf(billing), /There is no billing in the product yet/);
  assert.doesNotMatch(textOf(settings("memory")), /does not learn rules on its own yet/);
});

test("Settings derives its tab on every draw: the same page, drawn again with another tab, draws that tab's pane", () => {
  // Kept as state, the tab a page first drew would stand when a link moved it (a bell, an Ask answer), and a second
  // Settings address would tear the page down to change it (chrome.test.mjs read the page's text for this until 25 Nov
  // 2026).
  settings("hours");
  const again = draw("billing");
  assert.equal(all(again, (n) => n.type === PaneBillingReal).length, 1, "Billing, drawn over the page that held Hours");
  assert.equal(all(again, (n) => n.type === PaneWorkspace).length, 0, "and not the business's pane it had");
});

test("Settings' Back office is a link to the Console, for the people it is for and for nobody else", () => {
  // Not in Settings' own sections: a customer who types the route lands on a pane of theirs rather than on a locked door
  // they now know about. For the Console's staff (the payload's one bit, platform_admin) the rail ends with The Console,
  // which opens it, and the old address says where it went (decision 0066: one copy, not two). Read as tabs.ts's and
  // page.tsx's text in console/back-office/office/ until 26 Nov 2026.
  const went = [];
  const assign = globalThis.window.location.assign;
  globalThis.window.location.assign = (to) => went.push(to);
  const staff = (yes) =>
    bridgeHolds({ who: { me: { email: "alex@chanlytics.com", role: "owner", platform_admin: yes } } });
  try {
    staff(false);
    const customer = settings("platform");
    assert.equal(
      all(customer, (n) => n.props?.["data-testid"] === "set-nav-platform").length,
      0,
      "no row for a customer",
    );
    assert.equal(all(customer, (n) => n.props?.["data-testid"] === "set-console").length, 0, "nor the Console's pane");
    staff(true);
    const theirs = settings("platform");
    const [row] = all(theirs, (n) => n.props?.["data-testid"] === "set-nav-platform");
    assert.ok(row, "the rail's row for staff");
    assert.match(textOf(row), /The Console/);
    assert.equal(
      all(theirs, (n) => n.props?.["data-testid"] === "set-console").length,
      1,
      "and the old address says where it went",
    );
    row.props.onClick();
    assert.deepEqual(went, [CONSOLE_PATH], "the row opens the Console");
  } finally {
    globalThis.window.location.assign = assign;
    bridgeHolds({ who: { me: undefined } });
  }
});
