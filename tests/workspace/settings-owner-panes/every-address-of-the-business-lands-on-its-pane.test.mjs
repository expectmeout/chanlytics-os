/**
 * Every address of the business lands on its pane: Details keeps the route id `workspace`, and the addresses the
 * business's page answered before it was four tabs (hours, receptionist, outreach) still draw it, each opened on its
 * part, so a bookmark, an Ask answer and a bell's link written before the split all land. Memory, since it became
 * content (decision 0070), is a pane of its own. Drawn on the Settings page, not read from its text (25 Nov 2026).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { all, settings } from "./_settings-owner-panes.mjs";

const { PaneWorkspace } = await import("../../../apps/dashboard/src/surfaces/settings/frame/workspace.tsx");
const { PaneMemory } = await import("../../../apps/dashboard/src/surfaces/settings/memory/pane.tsx");

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
