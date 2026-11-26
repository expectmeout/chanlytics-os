/**
 * The truth pass: the last places a real workspace could reach something
 * seeded or something that silently did nothing.
 *
 * Settings → Billing and → AI memory fell through the shell's gate, which
 * replaced the whole settings page with a bare card titled "billing"; the
 * Conversations menu offered Export and Assign that opened an overlay stubbed
 * outside demos; the thread menu's "Mark as unread" flipped a flag the next
 * reseed wiped and "Block sender" opened the same dead overlay; a diagnostics
 * page shipped as a production route; two mockup files nobody loaded were
 * still in the tree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, importSrc } from "../../_source.mjs";
import { installStubReact, fresh, again, all, textOf } from "../../_stub-react.mjs";
import { bridgeHolds } from "../_bridge-holds.mjs";

bridgeHolds({ who: { workspaces: [], activeWorkspaceId: null } });
installStubReact();

test("Memory and Billing are real panes the registry classifies, so the gate no longer swallows the page", async () => {
  // Drawn, not read: each opens its own pane on the Settings page, and neither says it is not built
  // (workspace/settings-owner-panes/every-address-of-the-business-lands-on-its-pane.test.mjs). Each draws none of the
  // settings read, so its gate waits for who is looking, and a load's first draw for its own read beside it (the
  // Settings load review, 28 Oct 2026).
  const { SURFACE_STATES, ROUTE_SURFACE } = await importSrc("apps/dashboard/src/bridge/surface-registry.ts");
  for (const pane of ["billing", "memory"]) {
    assert.equal(SURFACE_STATES[`admin/${pane}`], "real", `${pane} classified`);
    assert.equal(ROUTE_SURFACE[`admin/${pane}`], "workspace", `${pane} waits for who is looking`);
  }
});

// The thread menu on a real workspace offers only verbs that act: drawn whole in
// conversations/inbox/thread-controls.test.mjs, Mark as unread where there is a person to mark (the reader's own mark,
// 00349) and none where there is nobody, the per-person mode under AI, and no Block sender (it went with demo mode, 16
// Nov 2026).

test("no diagnostics page in production, and the unloaded mockup files are gone", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "apps/dashboard/app/(os)/foundation")), "app/(os)/foundation still exists");
  for (const rel of ["apps/dashboard/mockup/design-canvas.jsx", "apps/dashboard/mockup/tweaks-panel.jsx"]) {
    assert.ok(!fs.existsSync(path.join(ROOT, rel)), `${rel} still in the tree`);
  }
  // Nothing imports them: an import of a file that is not there fails the typecheck and the build.
});

test("the page a crash lands on says what happened and sends nobody to a page the product does not have", async () => {
  const { default: OsError } = await importSrc("apps/dashboard/app/(os)/error.tsx");
  fresh();
  const drawn = again(() => globalThis.React.createElement(OsError, { error: new Error("boom"), reset() {} }));
  const words = textOf(drawn);
  assert.ok(words.trim().length > 0, "it says something");
  const hrefs = all(drawn, (n) => typeof n.props?.href === "string").map((n) => n.props.href);
  assert.ok(![words, ...hrefs].some((t) => t.includes("/foundation")), "REGRESSION: the diagnostics page, offered");
});
